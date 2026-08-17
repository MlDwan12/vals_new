import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  DataSource,
  EntityManager,
  IsNull,
  LessThanOrEqual,
  Repository,
} from 'typeorm';
import { isUniqueViolation } from '../../../core/persistence/postgres-error.util';
import { normalizeEmail } from '../util/normalize-email.util';
import { normalizePhone } from '../util/normalize-phone.util';
import { Client } from '../domain/client.entity';
import { ClientContact } from '../domain/client-contact.entity';
import { ClientLead } from '../domain/client-lead.entity';
import { ClientContactType } from '../enums/client-contact-type.enum';
import { ClientLeadType } from '../enums/client-lead-type.enum';
import { LeadDeliveryStatus } from '../enums/lead-delivery-status.enum';

interface SubmitLeadInput {
  type: ClientLeadType;
  name: string;
  phoneRaw: string;
  emailRaw: string | null;
  message: string | null;
  comment: string | null;
  utm: Record<string, string> | null;
  payload: Record<string, unknown>;
  bitrixPayload: Record<string, unknown>;
}

interface ResolvedClient {
  client: Client;
  normalizedPhone: string | null;
  normalizedEmail: string | null;
}

interface AdminLeadFilter {
  clientId?: number;
  type?: ClientLeadType;
  page: number;
  limit: number;
}

@Injectable()
export class ClientLeadsRepository {
  constructor(
    private readonly dataSource: DataSource,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ClientLeadsRepository.name);
  }

  // Дедуп/автослияние клиентов + сохранение лида — атомарно в одной транзакции (ТЗ §2, старый
  // алгоритм client-lead.service.ts перенесён без изменений: 0 совпадений → новый клиент, 1 →
  // переиспользуется, 2 разных (телефон/email указывают на разных клиентов) → тихое автослияние,
  // id поменьше побеждает). Доставка в Bitrix сюда не входит — статус лида всегда PENDING на выходе.
  async submitLead(input: SubmitLeadInput): Promise<ClientLead> {
    return this.dataSource.transaction(async (manager) => {
      const resolved = await this.resolveClient(
        manager,
        input.name,
        input.phoneRaw,
        input.emailRaw,
      );

      await this.attachContacts(
        manager,
        resolved.client.id,
        resolved.normalizedPhone,
        resolved.normalizedEmail,
      );

      const leadRepo = manager.getRepository(ClientLead);
      const lead = leadRepo.create({
        clientId: resolved.client.id,
        externalSystem: 'BITRIX',
        type: input.type,
        name: input.name.trim() || null,
        phoneRaw: input.phoneRaw,
        phoneNormalized: resolved.normalizedPhone,
        emailRaw: input.emailRaw,
        emailNormalized: resolved.normalizedEmail,
        message: input.message,
        comment: input.comment,
        utm: input.utm,
        payload: input.payload,
        bitrixPayload: input.bitrixPayload,
        bitrixResponse: null,
        bitrixLeadId: null,
        status: LeadDeliveryStatus.PENDING,
        retryCount: 0,
        nextRetryAt: null,
        bitrixError: null,
      });
      const savedLead = await leadRepo.save(lead);

      await manager
        .createQueryBuilder()
        .update(Client)
        .set({
          name: input.name.trim() || resolved.client.name,
          primaryPhone:
            resolved.normalizedPhone ?? resolved.client.primaryPhone,
          primaryEmail:
            resolved.normalizedEmail ?? resolved.client.primaryEmail,
          lastLeadAt: new Date(),
          leadsCount: () => '"leads_count" + 1',
        })
        .where('id = :id', { id: resolved.client.id })
        .execute();

      return savedLead;
    });
  }

  private async resolveClient(
    manager: EntityManager,
    name: string,
    phoneRaw: string,
    emailRaw: string | null,
  ): Promise<ResolvedClient> {
    const normalizedPhone = normalizePhone(phoneRaw);
    const normalizedEmail = normalizeEmail(emailRaw);

    const contactRepo = manager.getRepository(ClientContact);
    const clientRepo = manager.getRepository(Client);

    // Один запрос (OR по телефону/email) вместо двух последовательных — то же самое совпадение,
    // один round-trip.
    const matchConditions = [
      ...(normalizedPhone
        ? [{ type: ClientContactType.PHONE, value: normalizedPhone }]
        : []),
      ...(normalizedEmail
        ? [{ type: ClientContactType.EMAIL, value: normalizedEmail }]
        : []),
    ];
    const matchedContacts = matchConditions.length
      ? await contactRepo.find({ where: matchConditions })
      : [];
    const uniqueClientIds = [
      ...new Set(matchedContacts.map((contact) => contact.clientId)),
    ];

    if (uniqueClientIds.length === 0) {
      const client = await clientRepo.save(
        clientRepo.create({
          name: name.trim() || null,
          primaryPhone: normalizedPhone,
          primaryEmail: normalizedEmail,
          leadsCount: 0,
          lastLeadAt: null,
          isMerged: false,
          mergedIntoClientId: null,
        }),
      );
      return { client, normalizedPhone, normalizedEmail };
    }

    if (uniqueClientIds.length === 1) {
      const client = await clientRepo.findOne({
        where: { id: uniqueClientIds[0], isMerged: false },
      });
      if (!client) {
        throw new InternalServerErrorException('Клиент не найден');
      }
      return { client, normalizedPhone, normalizedEmail };
    }

    // Блокировка строк (FOR UPDATE): без неё два почти одновременных сабмита, сводящих одну и ту же
    // пару клиентов, могут оба пройти дальше по ветке «2 совпадения» и слить их дважды (удвоенный
    // leadsCount). Вторая транзакция здесь заблокируется до коммита первой, а после разблокировки
    // условие isMerged:false уже отфильтрует смерженного дубля — вернётся 1 клиент (primary), не 2,
    // duplicateClients окажется пустым, и mergeClients(...) корректно не сделает ничего повторно.
    const clients = await clientRepo
      .createQueryBuilder('client')
      .setLock('pessimistic_write')
      .where('client.id IN (:...ids)', { ids: uniqueClientIds })
      .andWhere('client.isMerged = false')
      .orderBy('client.id', 'ASC')
      .getMany();
    if (clients.length === 0) {
      throw new InternalServerErrorException('Совпадающие клиенты не найдены');
    }

    const [primaryClient, ...duplicateClients] = clients;
    await this.mergeClients(manager, primaryClient.id, duplicateClients);

    // Слияние не меняет собственные name/primaryPhone/primaryEmail строки primary (только
    // leadsCount, который здесь не используется дальше) — повторный SELECT не нужен, primaryClient
    // уже актуален для того, что вызывающий код (submitLead) из него читает.
    return { client: primaryClient, normalizedPhone, normalizedEmail };
  }

  private async attachContacts(
    manager: EntityManager,
    clientId: number,
    normalizedPhone: string | null,
    normalizedEmail: string | null,
  ): Promise<void> {
    const contactRepo = manager.getRepository(ClientContact);

    if (normalizedPhone) {
      await this.createContactIfMissing(
        contactRepo,
        clientId,
        ClientContactType.PHONE,
        normalizedPhone,
      );
    }
    if (normalizedEmail) {
      await this.createContactIfMissing(
        contactRepo,
        clientId,
        ClientContactType.EMAIL,
        normalizedEmail,
      );
    }
  }

  private async createContactIfMissing(
    repo: Repository<ClientContact>,
    clientId: number,
    type: ClientContactType,
    value: string,
  ): Promise<void> {
    const existing = await repo.findOne({ where: { type, value } });

    if (!existing) {
      try {
        await repo.save(
          repo.create({ clientId, type, value, isPrimary: true }),
        );
        return;
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;

        // Гонка: два одновременных сабмита с одним и тем же новым контактом — unique(type,value)
        // ловит второй insert. Перечитываем, кто реально успел создать контакт.
        const reloaded = await repo.findOne({ where: { type, value } });
        if (!reloaded) throw error;
        if (reloaded.clientId !== clientId) {
          throw new InternalServerErrorException(
            `Контакт ${type}:${value} принадлежит другому клиенту`,
          );
        }
        return;
      }
    }

    if (existing.clientId !== clientId) {
      throw new InternalServerErrorException(
        `Контакт ${type}:${value} принадлежит другому клиенту`,
      );
    }
  }

  // Автослияние — по решению пользователя, переносится 1:1 (ТЗ §2 требует дедуп/объединение дублей
  // как существующую функциональность), но теперь оставляет след в логах (не тихо, как в старом коде).
  private async mergeClients(
    manager: EntityManager,
    primaryClientId: number,
    duplicateClients: Client[],
  ): Promise<void> {
    if (duplicateClients.length === 0) return;

    const duplicateClientIds = duplicateClients.map((item) => item.id);

    await manager
      .createQueryBuilder()
      .update(ClientContact)
      .set({ clientId: primaryClientId })
      .where('client_id IN (:...duplicateClientIds)', { duplicateClientIds })
      .execute();

    await manager
      .createQueryBuilder()
      .update(ClientLead)
      .set({ clientId: primaryClientId })
      .where('client_id IN (:...duplicateClientIds)', { duplicateClientIds })
      .execute();

    // duplicateClients уже загружены вызывающим кодом (resolveClient) — не перечитываем их из БД
    // повторно только чтобы просуммировать leadsCount.
    const additionalLeadsCount = duplicateClients.reduce(
      (sum, item) => sum + item.leadsCount,
      0,
    );

    await manager
      .createQueryBuilder()
      .update(Client)
      .set({ leadsCount: () => `"leads_count" + ${additionalLeadsCount}` })
      .where('id = :id', { id: primaryClientId })
      .execute();

    await manager
      .createQueryBuilder()
      .update(Client)
      .set({ isMerged: true, mergedIntoClientId: primaryClientId })
      .where('id IN (:...duplicateClientIds)', { duplicateClientIds })
      .execute();

    this.logger.warn(
      { primaryClientId, duplicateClientIds },
      'Auto-merged duplicate clients on lead submission',
    );
  }

  // --- Доставка в Bitrix (планировщик + ручной retry) ---

  findDueForDelivery(limit: number): Promise<ClientLead[]> {
    return this.dataSource.getRepository(ClientLead).find({
      where: [
        { status: LeadDeliveryStatus.PENDING, nextRetryAt: IsNull() },
        {
          status: LeadDeliveryStatus.PENDING,
          nextRetryAt: LessThanOrEqual(new Date()),
        },
      ],
      order: { id: 'ASC' },
      take: limit,
    });
  }

  // Принимают уже загруженную entity (вызывающий — LeadDeliveryService.attemptDelivery — её и так
  // держит) вместо повторного SELECT по id. repo.update() не принимает jsonb-поля (bitrixResponse)
  // как плоский объект (QueryDeepPartialEntity ругается на типы) — та же причина, по которой
  // articles/cases/employees работают через save(), не update() (см. rewrite-log.md, этап 3).
  markSent(
    lead: ClientLead,
    bitrixLeadId: string,
    bitrixResponse: Record<string, unknown>,
  ): Promise<ClientLead> {
    lead.status = LeadDeliveryStatus.SENT;
    lead.bitrixLeadId = bitrixLeadId;
    lead.bitrixResponse = bitrixResponse;
    lead.bitrixError = null;
    lead.nextRetryAt = null;
    return this.dataSource.getRepository(ClientLead).save(lead);
  }

  markFailedAttempt(
    lead: ClientLead,
    retryCount: number,
    nextRetryAt: Date | null,
    bitrixError: string,
  ): Promise<ClientLead> {
    lead.status = nextRetryAt
      ? LeadDeliveryStatus.PENDING
      : LeadDeliveryStatus.FAILED;
    lead.retryCount = retryCount;
    lead.nextRetryAt = nextRetryAt;
    lead.bitrixError = bitrixError;
    return this.dataSource.getRepository(ClientLead).save(lead);
  }

  // --- Админка (read-only, как в старом коде) ---

  count(): Promise<number> {
    return this.dataSource.getRepository(ClientLead).count();
  }

  findById(id: number): Promise<ClientLead | null> {
    return this.dataSource.getRepository(ClientLead).findOne({ where: { id } });
  }

  async findAndCount(filter: AdminLeadFilter): Promise<[ClientLead[], number]> {
    return this.dataSource.getRepository(ClientLead).findAndCount({
      where: {
        ...(filter.clientId ? { clientId: filter.clientId } : {}),
        ...(filter.type ? { type: filter.type } : {}),
      },
      order: { id: 'DESC' },
      skip: (filter.page - 1) * filter.limit,
      take: filter.limit,
    });
  }

  findByClientId(clientId: number): Promise<ClientLead[]> {
    return this.dataSource
      .getRepository(ClientLead)
      .find({ where: { clientId }, order: { id: 'DESC' } });
  }
}

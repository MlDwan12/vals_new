import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { escapeLikePattern } from '../../../core/persistence/escape-like-pattern.util';
// Только класс-ссылка для manager.exists() в existsSentLeads — не отдельный @InjectRepository,
// та же причина, что у ServicesRepository.findReferencingCases (Case не регистрируется в
// ClientsModule отдельно — EntityManager знает обо всех сущностях DataSource глобально).
import { ClientLead } from '../domain/client-lead.entity';
import { Client } from '../domain/client.entity';
import { LeadDeliveryStatus } from '../enums/lead-delivery-status.enum';

@Injectable()
export class ClientsRepository {
  constructor(
    @InjectRepository(Client) private readonly repo: Repository<Client>,
  ) {}

  findById(id: number): Promise<Client | null> {
    return this.repo.findOne({ where: { id } });
  }

  // isMerged: false — тот же фильтр, что и в findAndCount() ниже: слитые дубли не должны считаться
  // отдельными клиентами (Б7, независимый аудит 2026-08-21 — дашборд без этого фильтра завышал
  // счётчик клиентов относительно того, что реально видно в /admin/clients).
  count(): Promise<number> {
    return this.repo.count({ where: { isMerged: false } });
  }

  // Совпадает со старым контрактом: поиск по primaryPhone/primaryEmail, слитые дубли из списка не
  // видны (isMerged: false) — как и в старом admin/client.
  findAndCount(
    page: number,
    limit: number,
    search?: string,
  ): Promise<[Client[], number]> {
    const pattern = search ? `%${escapeLikePattern(search)}%` : null;

    return this.repo.findAndCount({
      where: pattern
        ? [
            { isMerged: false, primaryPhone: ILike(pattern) },
            { isMerged: false, primaryEmail: ILike(pattern) },
          ]
        : { isMerged: false },
      select: {
        id: true,
        name: true,
        primaryPhone: true,
        primaryEmail: true,
        leadsCount: true,
        lastLeadAt: true,
        createdAt: true,
      },
      order: { id: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
  }

  // Проверка перед удалением (security-audit-2026-08-31.md №16) — merged_into_client_id обнуляется
  // каскадом (ON DELETE SET NULL), но isMerged на смерженных дублях не сбрасывается: без этой
  // проверки удаление primary-клиента оставляло бы «клиентов-призраков» (isMerged: true,
  // mergedIntoClientId: null — невидимы в дефолтном списке, никуда не резолвятся).
  existsAsMergeTarget(id: number): Promise<boolean> {
    return this.repo.exists({ where: { mergedIntoClientId: id } });
  }

  // Вторая половина той же находки №16 — client_leads.client_id CASCADE удаляет и уже
  // подтверждённые SENT лиды (лид при этом остаётся в Bitrix CRM, локальная история доставки
  // теряется безвозвратно). Только SENT, не любой лид — PENDING/FAILED/SENDING ещё не подтверждены
  // Bitrix'ом, их потеря при удалении клиента не создаёт расхождения с внешней системой.
  existsSentLeads(clientId: number): Promise<boolean> {
    return this.repo.manager.exists(ClientLead, {
      where: { clientId, status: LeadDeliveryStatus.SENT },
    });
  }

  async remove(id: number): Promise<void> {
    await this.repo.delete(id);
  }
}

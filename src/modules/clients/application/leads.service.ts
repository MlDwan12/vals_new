import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ClientLeadType } from '../enums/client-lead-type.enum';
import { ClientLeadsRepository } from '../infrastructure/client-leads.repository';
import { buildBitrixPayload, parseUtm } from './bitrix-payload.util';
import { CreateLeadDto } from '../dto/create-lead.dto';
import { TariffSnapshotResolverService } from './tariff-snapshot-resolver.service';

@Injectable()
export class LeadsService {
  constructor(
    private readonly clientLeadsRepository: ClientLeadsRepository,
    private readonly tariffSnapshotResolver: TariffSnapshotResolverService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LeadsService.name);
  }

  // Заявка сохраняется первой, доставка в Bitrix — асинхронно планировщиком (ТЗ §7 п.1). Этот метод
  // никогда не обращается к Bitrix напрямую — недоступность CRM не может повлиять на ответ клиенту.
  async submit(dto: CreateLeadDto): Promise<void> {
    if (dto.website) {
      // Honeypot сработал — тихо выходим, как будто заявка принята.
      return;
    }

    const tariff =
      dto.type === ClientLeadType.TARIFF_REQUEST
        ? await this.tariffSnapshotResolver.resolve(
            dto.tariffId!,
            dto.periodId!,
          )
        : null;

    const bitrixPayload = buildBitrixPayload({
      type: dto.type,
      name: dto.name,
      phone: dto.phone,
      email: dto.email ?? null,
      message: dto.message ?? null,
      comment: dto.comment ?? null,
      tariff,
    });

    const utm = parseUtm(dto.utm);
    if (utm) {
      Object.assign(bitrixPayload, utm);
    }

    // Остальные поля запроса (name/phone/email/type/message/comment) уже сохраняются как отдельные
    // типизированные колонки ClientLead — здесь нужен только тарифный снапшот, который больше нигде
    // не хранится структурированно.
    const payload: Record<string, unknown> = {
      tariff: tariff
        ? { tariffId: dto.tariffId, periodId: dto.periodId, ...tariff }
        : null,
    };

    try {
      await this.clientLeadsRepository.submitLead({
        type: dto.type,
        name: dto.name,
        phoneRaw: dto.phone,
        emailRaw: dto.email ?? null,
        message: dto.message ?? null,
        comment: dto.comment ?? null,
        utm,
        payload,
        bitrixPayload,
      });
    } catch (error) {
      // Падение БД на приёме — клиенту неизбежен 500 (ТЗ защищает только от недоступности CRM,
      // не БД), но тело заявки без этого лога терялось бы без следа. Дешёвая страховка на ручное
      // восстановление лида (M12 code review).
      this.logger.error({ err: error, dto }, 'Не удалось сохранить заявку');
      throw error;
    }
  }
}

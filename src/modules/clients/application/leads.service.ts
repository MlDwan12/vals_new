import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ClientLeadType } from '../enums/client-lead-type.enum';
import { ClientLeadsRepository } from '../infrastructure/client-leads.repository';
import { buildBitrixPayload, parseUtm } from './bitrix-payload.util';
import { CreateLeadDto } from '../dto/create-lead.dto';
import { TariffSnapshotResolverService } from './tariff-snapshot-resolver.service';
import { maskTail } from '../util/mask-tail.util';

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
      // не БД), но лид без этого лога терялся бы без следа — дешёвая страховка на ручное
      // восстановление (M12 code review). Логируется маскированная сводка, не весь dto: сырые
      // имя/телефон/email/сообщение — ПД, им не место в логах целиком (R4, round-2 review).
      // err.parameters (TypeORM QueryFailedError — реальные значения биндов, та же ПД вторым
      // каналом через сериализатор pino) вырезается redact-путём в app.module.ts, не дисциплиной
      // здесь — на случай, если error когда-нибудь начнут логировать где-то ещё без этой обёртки.
      this.logger.error(
        {
          err: error,
          lead: {
            type: dto.type,
            phoneTail: maskTail(dto.phone),
            emailTail: dto.email ? maskTail(dto.email) : null,
            utm,
          },
        },
        'Не удалось сохранить заявку',
      );
      throw error;
    }
  }
}

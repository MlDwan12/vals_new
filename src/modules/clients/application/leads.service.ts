import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { truncate } from '../../../core/util/truncate.util';
import { FormId, isKnownFormId } from '../constants/form-id.registry';
import { ClientLeadType } from '../enums/client-lead-type.enum';
import { ClientLeadsRepository } from '../infrastructure/client-leads.repository';
import { buildBitrixPayload, parseUtm } from './bitrix-payload.util';
import { CreateLeadDto } from '../dto/create-lead.dto';
import { TariffSnapshotResolverService } from './tariff-snapshot-resolver.service';
import { maskTail } from '../util/mask-tail.util';

const USER_AGENT_MAX_LENGTH = 512; // client_leads.user_agent — varchar(512)

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
  // rawUserAgent — не поле dto, а необрезанный заголовок запроса (см. LeadsController) — фронту
  // незачем его дублировать в теле, он и так есть у сервера.
  async submit(dto: CreateLeadDto, rawUserAgent: string | null): Promise<void> {
    if (dto.website) {
      // Honeypot сработал — тихо выходим, как будто заявка принята. До этой строки не делаем
      // ничего лишнего (в т.ч. не обрезаем userAgent) — на публичный неаутентифицированный роут
      // приходится в основном спам-трафик, отсекаемый именно здесь.
      return;
    }

    const userAgent = rawUserAgent
      ? truncate(rawUserAgent, USER_AGENT_MAX_LENGTH)
      : null;

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

    const formId = this.resolveFormId(dto.formId);

    // Остальные поля запроса (name/phone/email/type/message/comment) уже сохраняются как отдельные
    // типизированные колонки ClientLead — здесь нужен только тарифный снапшот и blockId (третье
    // поле внутренней метки формы, у него нет своей колонки — EXPANSION_TASKS.md §6), которые
    // больше нигде не хранятся структурированно.
    const payload: Record<string, unknown> = {
      tariff: tariff
        ? { tariffId: dto.tariffId, periodId: dto.periodId, ...tariff }
        : null,
      // !== undefined, не truthy-проверка — та же семантика "явного отсутствия", что у pagePath/
      // referrer/landingPath ниже (`?? null`): пустая строка, если её вообще пришлют, не пропадает
      // молча (code-review high — было расхождение с соседними полями той же метки формы).
      source: dto.blockId !== undefined ? { blockId: dto.blockId } : null,
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
        formId,
        pagePath: dto.pagePath ?? null,
        referrer: dto.referrer ?? null,
        landingPath: dto.landingPath ?? null,
        userAgent,
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

  // Незнакомый formId не отклоняет заявку (EXPANSION_TASKS.md §6, решение expansion-decisions.md
  // §6.1 — маркетинг может подключить новую форму раньше, чем бек об этом узнает) — метка просто
  // теряется, WARN сообщает, что реестр FORM_IDS пора пополнить.
  private resolveFormId(raw: string | undefined): FormId | null {
    if (!raw) return null;
    if (isKnownFormId(raw)) return raw;
    this.logger.warn({ formId: raw }, 'Неизвестный formId заявки');
    return null;
  }
}

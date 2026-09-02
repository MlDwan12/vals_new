import { Injectable } from '@nestjs/common';
import { isAxiosError } from 'axios';
import { PinoLogger } from 'nestjs-pino';
import { BitrixClient } from './bitrix-client';
import {
  computeNextRetryAt,
  isRetryableBitrixStatus,
} from './lead-retry-backoff.util';
import { ClientLead } from '../domain/client-lead.entity';
import { ClientLeadsRepository } from '../infrastructure/client-leads.repository';

@Injectable()
export class LeadDeliveryService {
  constructor(
    private readonly bitrixClient: BitrixClient,
    private readonly clientLeadsRepository: ClientLeadsRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LeadDeliveryService.name);
  }

  // markSent — это запись уже совершившегося факта (Bitrix принял лид), не сама доставка: её
  // сбой (обрыв пула, дедлок) не должен трактоваться как неудача доставки и уходить в retry —
  // это отправило бы уже принятый Bitrix лид туда второй раз (N1, round-2 review). Транзиентные
  // ошибки записи обычно снимаются за один-два повтора — дожимаем несколько раз перед тем, как
  // сдаться и оставить лид в SENDING для реклейма по таймауту (см. STUCK_SENDING_TIMEOUT_MS).
  private static readonly MARK_SENT_RETRY_ATTEMPTS = 3;
  private static readonly MARK_SENT_RETRY_DELAY_MS = 300;

  private async markSentWithRetry(
    lead: ClientLead,
    bitrixLeadId: string,
    response: Record<string, unknown>,
  ): Promise<ClientLead> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.clientLeadsRepository.markSent(
          lead,
          bitrixLeadId,
          response,
        );
      } catch (error) {
        const isLastAttempt =
          attempt >= LeadDeliveryService.MARK_SENT_RETRY_ATTEMPTS;
        this.logger[isLastAttempt ? 'error' : 'warn'](
          { leadId: lead.id, bitrixLeadId, attempt, err: error },
          isLastAttempt
            ? 'Lead delivered to Bitrix but failed to persist SENT status after retries — needs manual reconciliation'
            : 'Failed to persist SENT status, retrying',
        );
        if (isLastAttempt) throw error;
        await new Promise((resolve) =>
          setTimeout(resolve, LeadDeliveryService.MARK_SENT_RETRY_DELAY_MS),
        );
      }
    }
  }

  // Одна попытка доставки — используется и планировщиком (автоматические ретраи), и админским
  // ручным retry (§7 п.3 ТЗ). Возвращает актуальную entity — вызывающий уже держал её загруженной,
  // повторный SELECT не нужен. Если markSentWithRetry исчерпает попытки и бросит — лид остаётся в
  // SENDING (сознательно не откатывается в PENDING/FAILED), реклейм по STUCK_SENDING_TIMEOUT_MS
  // подберёт его позже; bitrixLeadId уже залогирован выше для ручной сверки.
  //
  // Принятый остаточный риск (security-audit-2026-08-31.md №13): если процесс упадёт строго между
  // успешным bitrixClient.sendLead() и коммитом markSent() (например, kill процесса/OOM в этот
  // конкретный момент), лид остаётся в SENDING и будет реклеймлен по таймауту — повторный
  // sendLead() создаст в Bitrix дубль лида. crm.lead.add в REST API Bitrix24 не поддерживает
  // идемпотентный ключ, закрыть на уровне запроса нечем. Окно узкое (один await между HTTP-ответом
  // и записью в БД) — сознательно не чиним, не эксплуатируется намеренно.
  async attemptDelivery(lead: ClientLead): Promise<ClientLead> {
    let bitrixLeadId: string;
    let response: Record<string, unknown>;
    try {
      ({ bitrixLeadId, response } = await this.bitrixClient.sendLead(
        lead.bitrixPayload ?? {},
      ));
    } catch (error) {
      const retryCount = lead.retryCount + 1;
      const status = isAxiosError(error) ? error.response?.status : undefined;
      const nextRetryAt = isRetryableBitrixStatus(status)
        ? computeNextRetryAt(retryCount)
        : null;
      const message = error instanceof Error ? error.message : 'Unknown error';

      // Не логировать error целиком: для AxiosError это утекает config.url (вебхук с секретным
      // токеном Bitrix) и config.data (ПД лида) через сериализатор pino. Только безопасные поля.
      this.logger.warn(
        {
          leadId: lead.id,
          retryCount,
          nextRetryAt,
          errorMessage: message,
          errorCode: isAxiosError(error) ? error.code : undefined,
          responseStatus: status,
        },
        nextRetryAt
          ? 'Bitrix delivery failed, will retry'
          : 'Bitrix delivery failed, giving up',
      );

      return this.clientLeadsRepository.markFailedAttempt(
        lead,
        retryCount,
        nextRetryAt,
        message,
      );
    }

    return this.markSentWithRetry(lead, bitrixLeadId, response);
  }
}

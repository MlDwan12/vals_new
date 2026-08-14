import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { BitrixClient } from './bitrix-client';
import { computeNextRetryAt } from './lead-retry-backoff.util';
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

  // Одна попытка доставки — используется и планировщиком (автоматические ретраи), и админским
  // ручным retry (§7 п.3 ТЗ). Никогда не бросает — результат всегда отражается в статусе лида.
  // Возвращает актуальную entity — вызывающий уже держал её загруженной, повторный SELECT не нужен.
  async attemptDelivery(lead: ClientLead): Promise<ClientLead> {
    try {
      const { bitrixLeadId, response } = await this.bitrixClient.sendLead(
        lead.bitrixPayload ?? {},
      );
      return await this.clientLeadsRepository.markSent(
        lead,
        bitrixLeadId,
        response,
      );
    } catch (error) {
      const retryCount = lead.retryCount + 1;
      const nextRetryAt = computeNextRetryAt(retryCount);
      const message = error instanceof Error ? error.message : 'Unknown error';

      this.logger.warn(
        { leadId: lead.id, retryCount, nextRetryAt, err: error },
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
  }
}

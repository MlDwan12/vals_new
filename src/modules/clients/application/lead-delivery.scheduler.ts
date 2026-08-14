import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { LeadDeliveryService } from './lead-delivery.service';
import { ClientLeadsRepository } from '../infrastructure/client-leads.repository';

const BATCH_SIZE = 20;
// Каждая попытка — независимый HTTP-вызов (до 10с таймаут) на свою заявку, без общего состояния
// между ними — ограниченный параллелизм безопасен и не даёт одному тику растянуться на весь батч
// последовательно.
const CONCURRENCY = 5;

// Без внешней очереди (ТЗ §7 п.1) — периодический тик подбирает лиды со статусом PENDING, у которых
// подошло время следующей попытки (или это первая попытка вообще), и доставляет их пачками.
@Injectable()
export class LeadDeliveryScheduler {
  // Тик может растянуться дольше минуты при деградировавшем Bitrix (до 10с на попытку) — без этого
  // флага следующий тик по расписанию подхватил бы те же лиды (status меняется только после того,
  // как HTTP-вызов реально завершится) и отправил бы их в Bitrix второй раз параллельно.
  private isRunning = false;

  constructor(
    private readonly clientLeadsRepository: ClientLeadsRepository,
    private readonly leadDeliveryService: LeadDeliveryService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LeadDeliveryScheduler.name);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async run(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn(
        'Previous delivery tick is still running, skipping this one',
      );
      return;
    }

    this.isRunning = true;
    try {
      const dueLeads =
        await this.clientLeadsRepository.findDueForDelivery(BATCH_SIZE);
      if (dueLeads.length === 0) return;

      this.logger.info(
        { count: dueLeads.length },
        'Attempting Bitrix delivery for due leads',
      );

      for (let i = 0; i < dueLeads.length; i += CONCURRENCY) {
        const chunk = dueLeads.slice(i, i + CONCURRENCY);
        await Promise.all(
          chunk.map((lead) => this.leadDeliveryService.attemptDelivery(lead)),
        );
      }
    } finally {
      this.isRunning = false;
    }
  }
}

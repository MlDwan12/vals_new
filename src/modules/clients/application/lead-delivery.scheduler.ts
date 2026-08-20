import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { SingleFlightGuard } from '../../../core/scheduling/single-flight-guard';
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
  // Тик может растянуться дольше минуты при деградировавшем Bitrix (до 10с на попытку) — без
  // этого следующий тик по расписанию подхватил бы те же лиды (status меняется только после того,
  // как HTTP-вызов реально завершится) и отправил бы их в Bitrix второй раз параллельно.
  private readonly guard: SingleFlightGuard;

  constructor(
    private readonly clientLeadsRepository: ClientLeadsRepository,
    private readonly leadDeliveryService: LeadDeliveryService,
    private readonly logger: PinoLogger,
  ) {
    logger.setContext(LeadDeliveryScheduler.name);
    this.guard = new SingleFlightGuard(logger, 'delivery');
  }

  @Cron(CronExpression.EVERY_MINUTE)
  run(): Promise<void> {
    return this.guard.run(() => this.deliverDueLeads());
  }

  private async deliverDueLeads(): Promise<void> {
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
        chunk.map(async (lead) => {
          // Claim перед отправкой: при перекрывающемся деплое (несколько живых инстансов)
          // каждый инстанс сам находит одни и те же due-лиды через find(), но заберёт лид
          // только один — остальные получат null и пропустят его (H10).
          const claimed = await this.clientLeadsRepository.claimForDelivery(
            lead.id,
          );
          if (!claimed) return;
          try {
            await this.leadDeliveryService.attemptDelivery(claimed);
          } catch (error) {
            // Без catch исключение уходит из cron-тика мимо HttpExceptionFilter (тот работает
            // только в HTTP-контексте) в сырой console.error библиотеки cron — второй канал
            // утечки ПД/секретов в обход redact из app.module.ts. LeadDeliveryService и так уже
            // безопасно логирует причину перед тем, как бросить (markSentWithRetry) — это
            // подстраховка на случай будущих throw-путей, не дублирование (найдено при полном
            // аудите проекта).
            this.logger.error(
              { leadId: claimed.id, err: error },
              'attemptDelivery завершился необработанной ошибкой в шедулере',
            );
          }
        }),
      );
    }
  }
}

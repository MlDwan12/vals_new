import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { EnvConfig } from '../../../config/env.validation';
import { AuditLogRepository } from '../infrastructure/audit-log.repository';

const DAY_MS = 24 * 60 * 60 * 1000;

// ТЗ §7 п.5 — политика хранения audit_logs: без чистки таблица растёт неограниченно (старый код
// такой чистки не имел вовсе). Срок — из конфига (EXPANSION_TASKS.md §2.5), не константой здесь.
@Injectable()
export class AuditRetentionScheduler {
  constructor(
    private readonly repository: AuditLogRepository,
    private readonly logger: PinoLogger,
    private readonly configService: ConfigService<EnvConfig, true>,
  ) {
    this.logger.setContext(AuditRetentionScheduler.name);
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async run(): Promise<void> {
    const retentionDays = this.configService.get('AUDIT_RETENTION_DAYS', {
      infer: true,
    });
    const cutoff = new Date(Date.now() - retentionDays * DAY_MS);
    const deleted = await this.repository.deleteOlderThan(cutoff);
    if (deleted > 0) {
      this.logger.info({ deleted, cutoff }, 'Audit log retention cleanup');
    }
  }
}

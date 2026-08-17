import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogRepository } from '../infrastructure/audit-log.repository';

const RETENTION_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

// ТЗ §7 п.5 — политика хранения audit_logs: без чистки таблица растёт неограниченно (старый код
// такой чистки не имел вовсе).
@Injectable()
export class AuditRetentionScheduler {
  constructor(
    private readonly repository: AuditLogRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AuditRetentionScheduler.name);
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async run(): Promise<void> {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * DAY_MS);
    const deleted = await this.repository.deleteOlderThan(cutoff);
    if (deleted > 0) {
      this.logger.info({ deleted, cutoff }, 'Audit log retention cleanup');
    }
  }
}

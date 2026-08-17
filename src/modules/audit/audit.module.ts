import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogsAdminController } from './api/audit-logs-admin.controller';
import { AuditRetentionScheduler } from './application/audit-retention.scheduler';
import { AuditService } from './application/audit.service';
import { AuditLog } from './domain/audit-log.entity';
import { AuditLogRepository } from './infrastructure/audit-log.repository';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  controllers: [AuditLogsAdminController],
  providers: [AuditService, AuditLogRepository, AuditRetentionScheduler],
  // CoreModule подключает AuditInterceptor/HttpExceptionFilter — обоим нужен AuditService для
  // записи (успешные мутации и security-события соответственно).
  exports: [AuditService],
})
export class AuditModule {}

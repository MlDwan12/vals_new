import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLog } from './domain/audit-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
})
export class AuditModule {}

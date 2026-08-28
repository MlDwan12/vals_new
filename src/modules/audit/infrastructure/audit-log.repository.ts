import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { escapeLikePattern } from '../../../core/persistence/escape-like-pattern.util';
import { AuditLog } from '../domain/audit-log.entity';

export interface CreateAuditLogRecord {
  userId: number | null;
  username: string | null;
  role: string | null;
  action: string;
  method: string;
  path: string;
  resource: string | null;
  resourceId: number | null;
  statusCode: number;
  errorMessage: string | null;
  ip: string | null;
  meta: Record<string, unknown> | null;
  signed: boolean;
}

export interface AuditLogFilter {
  page: number;
  limit: number;
  userId?: number;
  username?: string;
  action?: string;
  resource?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

@Injectable()
export class AuditLogRepository {
  constructor(
    @InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>,
  ) {}

  async insert(data: CreateAuditLogRecord): Promise<void> {
    await this.repo.save(this.repo.create(data));
  }

  findAndCount(filter: AuditLogFilter): Promise<[AuditLog[], number]> {
    const qb = this.repo
      .createQueryBuilder('log')
      .orderBy('log.createdAt', 'DESC')
      .skip((filter.page - 1) * filter.limit)
      .take(filter.limit);

    if (filter.userId !== undefined) {
      qb.andWhere('log.userId = :userId', { userId: filter.userId });
    }
    if (filter.username) {
      qb.andWhere('log.username ILIKE :username', {
        username: `%${escapeLikePattern(filter.username)}%`,
      });
    }
    if (filter.action) {
      qb.andWhere('log.action = :action', { action: filter.action });
    }
    if (filter.resource) {
      qb.andWhere('log.resource = :resource', { resource: filter.resource });
    }
    if (filter.dateFrom) {
      qb.andWhere('log.createdAt >= :dateFrom', { dateFrom: filter.dateFrom });
    }
    if (filter.dateTo) {
      qb.andWhere('log.createdAt <= :dateTo', { dateTo: filter.dateTo });
    }

    return qb.getManyAndCount();
  }

  async deleteOlderThan(cutoff: Date): Promise<number> {
    const result = await this.repo
      .createQueryBuilder()
      .delete()
      .where('created_at < :cutoff', { cutoff })
      .execute();
    return result.affected ?? 0;
  }
}

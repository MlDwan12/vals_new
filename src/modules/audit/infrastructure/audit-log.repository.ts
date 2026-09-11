import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { escapeLikePattern } from '../../../core/persistence/escape-like-pattern.util';
import { AuditLog } from '../domain/audit-log.entity';
import { AuditOutcome, DENIED_STATUS_CODES } from '../enums/audit-outcome.enum';

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
  outcome?: AuditOutcome;
  dateFrom?: Date;
  dateTo?: Date;
}

// Значения, которыми реально заполнен журнал, — для селектов фильтра.
export interface AuditLogFacets {
  actions: string[];
  resources: string[];
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
    if (filter.outcome === AuditOutcome.SUCCESS) {
      qb.andWhere('log.statusCode < 400');
    } else if (filter.outcome === AuditOutcome.DENIED) {
      qb.andWhere('log.statusCode IN (:...deniedCodes)', {
        deniedCodes: DENIED_STATUS_CODES,
      });
    } else if (filter.outcome === AuditOutcome.ERROR) {
      qb.andWhere(
        'log.statusCode >= 400 AND log.statusCode NOT IN (:...deniedCodes)',
        { deniedCodes: DENIED_STATUS_CODES },
      );
    }
    if (filter.dateFrom) {
      qb.andWhere('log.createdAt >= :dateFrom', { dateFrom: filter.dateFrom });
    }
    if (filter.dateTo) {
      qb.andWhere('log.createdAt <= :dateTo', { dateTo: filter.dateTo });
    }

    return qb.getManyAndCount();
  }

  // Два DISTINCT по индексированным колонкам вместо справочника в коде: значения `action`
  // пополняются декоратором @Audit, а `resource` — первым сегментом любого нового пути, так что
  // любой захардкоженный список молча отстал бы (та же беда, что с реестром форм в срезе D).
  async findFacets(): Promise<AuditLogFacets> {
    const [actions, resources] = await Promise.all([
      this.repo
        .createQueryBuilder('log')
        .select('DISTINCT log.action', 'value')
        .orderBy('value', 'ASC')
        .getRawMany<{ value: string }>(),
      this.repo
        .createQueryBuilder('log')
        .select('DISTINCT log.resource', 'value')
        .where('log.resource IS NOT NULL')
        .orderBy('value', 'ASC')
        .getRawMany<{ value: string }>(),
    ]);

    return {
      actions: actions.map((row) => row.value),
      resources: resources.map((row) => row.value),
    };
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

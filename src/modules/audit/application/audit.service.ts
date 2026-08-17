import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../../core/pagination/paginated-result.interface';
import { AuditLogResponseDto } from '../dto/audit-log-response.dto';
import { AuditLogQueryDto } from '../dto/audit-log-query.dto';
import {
  AuditLogRepository,
  CreateAuditLogRecord,
} from '../infrastructure/audit-log.repository';

@Injectable()
export class AuditService {
  constructor(
    private readonly repository: AuditLogRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AuditService.name);
  }

  // Никогда не бросает — запись аудита не должна ронять запрос, ради которого она пишется
  // (симметрично тому, как недоступность Bitrix/Meilisearch не должна ронять свою операцию).
  // Подавление повторных анонимных ACCESS_DENIED (ТЗ §7 п.5) — забота вызывающей стороны
  // (HttpExceptionFilter, единственный источник ACCESS_DENIED), не этого общего метода записи.
  async log(entry: CreateAuditLogRecord): Promise<void> {
    try {
      await this.repository.insert(entry);
    } catch (error) {
      this.logger.warn({ err: error, entry }, 'Не удалось записать audit-лог');
    }
  }

  async findAll(
    query: AuditLogQueryDto,
  ): Promise<PaginatedResult<AuditLogResponseDto>> {
    const [items, total] = await this.repository.findAndCount({
      page: query.page,
      limit: query.limit,
      userId: query.userId,
      username: query.username,
      action: query.action,
      resource: query.resource,
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
    });

    return buildPaginatedResult(
      items.map((item) => AuditLogResponseDto.fromEntity(item)),
      total,
      query.page,
      query.limit,
    );
  }
}

import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../core/dto/pagination-query.dto';
import { AuditOutcome } from '../enums/audit-outcome.enum';

export class AuditLogQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number;

  @IsOptional()
  @IsString()
  username?: string;

  // Не IsEnum(AuditAction) — @Audit (EXPANSION_TASKS.md §2.3) кладёт в это же поле произвольные
  // строки-события ("password_reset"), не только базовую CRUD-классификацию. Колонка и так была
  // свободной строкой на уровне БД (audit_logs.action — varchar(64)) — фильтр теперь тоже
  // свободный, но с тем же потолком длины, что и у соседних свободнострочных фильтров этого же
  // модуля (username выше) и других модулей (client-list-query.dto.ts, media-list-query.dto.ts).
  @IsOptional()
  @IsString()
  @MaxLength(64)
  action?: string;

  @IsOptional()
  @IsString()
  resource?: string;

  // Исход (успех / отказ / ошибка) вместо statusCode: половина журнала — отказы, и экрану нужно
  // «покажи всё, кроме них». Через action такой фильтр не собирается — ACCESS_DENIED ставится
  // только HttpExceptionFilter'ом, а 400/404 приходят с обычными CREATE/UPDATE.
  @IsOptional()
  @IsEnum(AuditOutcome)
  outcome?: AuditOutcome;

  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @IsOptional()
  @IsISO8601()
  dateTo?: string;
}

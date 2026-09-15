import { Type } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../core/dto/pagination-query.dto';
import { ClientLeadType } from '../enums/client-lead-type.enum';
import { LeadDeliveryStatus } from '../enums/lead-delivery-status.enum';

// Статусы, которые видит админка: SENDING наружу не отдаётся (см. ClientLeadResponseDto), поэтому
// и фильтровать по нему нельзя — «в очереди» в репозитории покрывает PENDING и SENDING вместе.
export const ADMIN_LEAD_STATUSES = [
  LeadDeliveryStatus.PENDING,
  LeadDeliveryStatus.SENT,
  LeadDeliveryStatus.FAILED,
] as const;

export type AdminLeadStatus = (typeof ADMIN_LEAD_STATUSES)[number];

export class ClientLeadListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  clientId?: number;

  @IsOptional()
  @IsEnum(ClientLeadType)
  type?: ClientLeadType;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  formId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  pagePath?: string;

  @IsOptional()
  @IsIn(ADMIN_LEAD_STATUSES)
  status?: AdminLeadStatus;

  // Границы включительно, как у журнала действий: «по» админка присылает концом выбранного дня.
  @IsOptional()
  @IsISO8601()
  dateFrom?: string;

  @IsOptional()
  @IsISO8601()
  dateTo?: string;

  // Один поиск на имя, телефон и почту — менеджер ищет заявку по тому, что у него под рукой.
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;
}

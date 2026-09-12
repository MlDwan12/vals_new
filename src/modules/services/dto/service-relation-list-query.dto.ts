import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../core/dto/pagination-query.dto';

// Карточка услуги в панели показывает связи только этой услуги, а не весь список: без фильтра
// ей пришлось бы тянуть все связи всех услуг и отбирать нужные у себя — и молча терять часть,
// как только их станет больше страницы.
export class ServiceRelationListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  serviceId?: number;
}

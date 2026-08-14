import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../core/dto/pagination-query.dto';
import { SortByDate } from '../../../core/enums/sort-by-date.enum';

export class ServiceListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(SortByDate)
  sortBy?: SortByDate;
}

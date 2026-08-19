import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationQueryDto } from '../../../core/dto/pagination-query.dto';
import { SortByDate } from '../../../core/enums/sort-by-date.enum';

export class ServiceListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  search?: string;

  @IsOptional()
  @IsEnum(SortByDate)
  sortBy?: SortByDate;
}

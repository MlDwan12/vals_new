import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../core/dto/pagination-query.dto';
import { SortByDate } from '../../../core/enums/sort-by-date.enum';

export class ArticleListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(SortByDate)
  sortBy?: SortByDate;

  @IsOptional()
  @IsString()
  authorSlug?: string;

  @IsOptional()
  @IsString()
  tagSlug?: string;
}

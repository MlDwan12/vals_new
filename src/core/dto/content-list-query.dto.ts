import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto';
import { SortByDate } from '../enums/sort-by-date.enum';

// Общий список параметров пагинированного списка контента (articles/cases) — вынесено из-за
// байт-в-байт идентичных ArticleListQueryDto/CaseListQueryDto.
export class ContentListQueryDto extends PaginationQueryDto {
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

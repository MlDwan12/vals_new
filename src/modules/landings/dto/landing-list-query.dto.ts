import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { PaginationQueryDto } from '../../../core/dto/pagination-query.dto';
import { SortByDate } from '../../../core/enums/sort-by-date.enum';

export class LandingListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(SortByDate)
  sortBy?: SortByDate;

  // @Min(1) — не только семантика (id первичных ключей всегда >= 1), но и защита от того, что
  // LandingsRepository.mainInfoQuery() проверяет фильтр через `if (query.serviceId)`: без нижней
  // границы serviceId=0 прошёл бы валидацию, но truthy-проверка молча съела бы фильтр вместо того,
  // чтобы вернуть пустой список (code review).
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  serviceId?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  industryId?: number;
}

import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../core/dto/pagination-query.dto';

export class MediaListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;
}

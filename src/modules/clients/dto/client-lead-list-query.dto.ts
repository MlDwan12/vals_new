import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../../core/dto/pagination-query.dto';
import { ClientLeadType } from '../enums/client-lead-type.enum';

export class ClientLeadListQueryDto extends PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  clientId?: number;

  @IsOptional()
  @IsEnum(ClientLeadType)
  type?: ClientLeadType;
}

import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';
import { ServiceBackgroundColor } from '../enums/service-background-color.enum';

export class CreateServiceDto {
  @IsString()
  @IsNotEmpty()
  slug: string;

  @IsInt()
  @Min(1)
  categoryId: number;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsOptional()
  @IsString()
  subtitle?: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsString()
  @IsNotEmpty()
  subDescription: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  list?: string[];

  @IsString()
  @IsNotEmpty()
  icon: string;

  // NOT NULL с дефолтом в БД — @IsOptional() пропустил бы явный null мимо валидации на PATCH
  // (code review, тот же приём, что у priority/hasToc в статьях/кейсах).
  @ValidateIf((_, value) => value !== undefined)
  @IsEnum(ServiceBackgroundColor)
  backgroundColor?: ServiceBackgroundColor;
}

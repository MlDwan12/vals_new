import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
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

  @IsOptional()
  @IsEnum(ServiceBackgroundColor)
  backgroundColor?: ServiceBackgroundColor;
}

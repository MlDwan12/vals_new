import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MaxLength,
} from 'class-validator';
import { MaxKeywords } from '../../../core/validators/max-keywords.validator';

export class CreateArticleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  slug: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  // Основной контент статьи (JSON редактора, например TipTap)
  @IsObject()
  content: Record<string, unknown>;

  @IsOptional()
  @IsString()
  contentHtml?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  metaTitle?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;

  @IsOptional()
  @IsString()
  @MaxKeywords(5, { message: 'Можно указать не более 5 ключевых фраз' })
  keywords?: string;

  // null — черновик, будущая дата — запланированная публикация, прошедшая — опубликовано
  @IsOptional()
  @IsDateString()
  datePublished?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  priority?: number;

  // Время чтения в минутах — указывается вручную, не вычисляется
  @IsOptional()
  @IsInt()
  @Min(1)
  readingTime?: number | null;

  @IsOptional()
  @IsBoolean()
  hasToc?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  authorIds: number[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  tagIds?: number[];
}

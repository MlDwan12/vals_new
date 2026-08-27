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
  Matches,
  Min,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { MaxKeywords } from '../../../core/validators/max-keywords.validator';

export class CreateCaseDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  // slug — прямой пользовательский ввод из CONTENT-админки, встраивается в публичный маршрут
  // (Б8, независимый аудит 2026-08-21) — без формата пробелы/`/`/`?`/кириллица проходили бы как есть.
  @Matches(/^[a-z0-9-]+$/, {
    message:
      'slug может содержать только латиницу в нижнем регистре, цифры и дефис',
  })
  slug: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsString()
  @IsNotEmpty()
  problem: string;

  @IsString()
  @IsNotEmpty()
  result: string;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  @MaxLength(64, { each: true })
  industry: string[];

  // Основной контент кейса (JSON редактора, например TipTap)
  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;

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

  // NOT NULL с дефолтом в БД — @IsOptional() пропустил бы явный null мимо валидации на PATCH
  // (см. update-article.dto.ts/create-article.dto.ts — тот же приём, code review).
  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(0)
  priority?: number;

  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  hasToc?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  serviceIds: number[];

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

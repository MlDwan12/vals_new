import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
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

export class CreateLandingDto {
  @IsInt()
  @Min(1)
  serviceId: number;

  @IsInt()
  @Min(1)
  industryId: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  // slug — прямой пользовательский ввод, встраивается в публичный маршрут (тот же формат-контракт,
  // что у articles/cases/news/tags — Б8, независимый аудит 2026-08-21). Уникален только в пределах
  // service_id (составной индекс на entity), не глобально.
  @Matches(/^[a-z0-9-]+$/, {
    message:
      'slug может содержать только латиницу в нижнем регистре, цифры и дефис',
  })
  slug: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  h1: string;

  @IsOptional()
  @IsString()
  subtitle?: string;

  // Основной контент страницы (JSON редактора)
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

  // Преимущества — список пунктов
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  advantages?: string[];

  @IsOptional()
  @IsString()
  ctaTitle?: string;

  @IsOptional()
  @IsString()
  ctaSubtitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  ctaButtonText?: string;

  // Обложка — опциональная ссылка на медиатеку. null — явно снять обложку на PATCH.
  @IsOptional()
  @IsInt()
  @Min(1)
  coverMediaId?: number | null;

  // NOT NULL с дефолтом в БД — @IsOptional() пропустил бы явный null мимо валидации на PATCH
  // (см. create-article.dto.ts — тот же приём и причина).
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  isPublished?: boolean;

  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(0)
  priority?: number;

  // Связанные кейсы — опционально, без порядка.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  caseIds?: number[];
}

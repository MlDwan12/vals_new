import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { MaxKeywords } from '../../../core/validators/max-keywords.validator';
import { ServiceBackgroundColor } from '../enums/service-background-color.enum';

export class CreateServiceDto {
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

  // Мета-поля — EXPANSION_TASKS.md задача 9, тот же контракт валидации, что у CreateArticleDto.
  @IsOptional()
  @IsString()
  @MaxLength(255)
  metaTitle?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;

  // 10, а не 5 как у остальных сущностей: у 18 живых услуг в front/.../*.seo.ts от 6 до 8 фраз
  // (замер срезом E.1), и лимит 5 отклонил бы каждую из них — сначала при переносе, а потом при
  // любой правке услуги из панели, потому что форма валидируется целиком. Сокращать ключи —
  // решение SEO, не разработки. У статей, кейсов, новостей и лендингов живые данные в 5
  // укладываются, там лимит не трогаем.
  @IsOptional()
  @IsString()
  @MaxKeywords(10, { message: 'Можно указать не более 10 ключевых фраз' })
  keywords?: string;

  // Заголовок страницы услуги — с разметкой: на сайте он рендерится не как текст, а как элемент
  // с переносами строк (<br>) и выделенной частью (<span>), которой стили рисуют линию под
  // текстом. Больше в заголовках услуг ничего не встречается (проверено по всем 18 при переносе
  // в E.2), поэтому набор тегов закрыт: остальное сайт всё равно вырежет при выводе, но лучше
  // отказать сразу и понятным текстом.
  @IsOptional()
  @IsString()
  @MaxLength(255)
  @Matches(/^(?:[^<>]|<br\s*\/?>|<\/?span>)*$/, {
    message: 'В заголовке можно использовать только <br> и <span>…</span>',
  })
  h1?: string;
}

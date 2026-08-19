import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateEmployeeDto {
  // Slug сотрудника — уникальный URL персональной страницы
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  slug: string;

  // Полное имя (не инициалы — важно для доверия к автору)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  position: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  photoUrl?: string;

  // Короткое описание 1-2 предложения — карточка «О компании» + подпись под статьёй/кейсом
  @IsOptional()
  @IsString()
  shortBio?: string;

  // Полное био — JSON контент редактора (TipTap), для персональной страницы
  @IsOptional()
  @IsObject()
  bio?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  bioHtml?: string;

  // Стаж, свободная форма («6 лет в digital-маркетинге»)
  @IsOptional()
  @IsString()
  experience?: string;

  // Ссылки на внешние профили. NOT NULL с дефолтом '[]' в БД — @IsOptional() пропустил бы явный
  // null мимо валидации (падал бы not-null violation'ом в БД, code review).
  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  sameAs?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(255)
  metaTitle?: string;

  @IsOptional()
  @IsString()
  metaDescription?: string;

  // Порядок на странице «Команда». NOT NULL с дефолтом — см. sameAs выше.
  @ValidateIf((_, value) => value !== undefined)
  @IsInt()
  @Min(0)
  priority?: number;

  // Видимость на сайте (false — скрыт, но авторство в старых материалах сохраняется). NOT NULL
  // с дефолтом — см. sameAs выше.
  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  isVisible?: boolean;
}

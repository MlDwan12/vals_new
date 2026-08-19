import { IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';

export class CreateIndustryDto {
  // Slug публичной страницы отрасли — необязателен: страница появляется только после того, как
  // slug задан (см. IndustriesController.findPublishedBySlug). ValidateIf, не IsOptional: ключ
  // может отсутствовать (страницы ещё нет), но явный `null` отклоняется валидацией (400) — иначе
  // PATCH мог бы обнулить уже опубликованный slug, освободив его для другой отрасли, а исходная
  // потеряла бы свой URL безвозвратно (уникальный индекс не даст забрать slug обратно). IsOptional
  // здесь не подходит — при наследовании в UpdateIndustryDto (PartialType) он бы пропускал `null`
  // мимо всех остальных валидаторов независимо от skipNullProperties у самого PartialType.
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  slug?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  name: string;
}

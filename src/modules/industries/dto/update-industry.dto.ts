import { PartialType } from '@nestjs/mapped-types';
import { CreateIndustryDto } from './create-industry.dto';

// skipNullProperties: false — поля можно опускать (PATCH частичный), но не обнулять явным `null`;
// `slug` иначе можно было бы освободить у уже опубликованной отрасли (см. CreateIndustryDto).
export class UpdateIndustryDto extends PartialType(CreateIndustryDto, {
  skipNullProperties: false,
}) {}

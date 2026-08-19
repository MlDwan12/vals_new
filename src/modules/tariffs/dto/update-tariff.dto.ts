import { PartialType } from '@nestjs/mapped-types';
import { CreateTariffDto } from './create-tariff.dto';

// skipNullProperties: false — см. update-article-faq.dto.ts (M2 code review).
export class UpdateTariffDto extends PartialType(CreateTariffDto, {
  skipNullProperties: false,
}) {}

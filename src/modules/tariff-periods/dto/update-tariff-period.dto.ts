import { PartialType } from '@nestjs/mapped-types';
import { CreateTariffPeriodDto } from './create-tariff-period.dto';

// skipNullProperties: false — см. update-article-faq.dto.ts (M2 code review).
export class UpdateTariffPeriodDto extends PartialType(CreateTariffPeriodDto, {
  skipNullProperties: false,
}) {}

import { PartialType } from '@nestjs/mapped-types';
import { CreateLandingDto } from './create-landing.dto';

// skipNullProperties: false — см. update-article-faq.dto.ts (M2 code review): явный null в PATCH
// (например, coverMediaId: null) должен пройти валидацию, а не быть проигнорирован PartialType.
export class UpdateLandingDto extends PartialType(CreateLandingDto, {
  skipNullProperties: false,
}) {}

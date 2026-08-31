import { PartialType } from '@nestjs/mapped-types';
import { CreateLandingFaqDto } from './create-landing-faq.dto';

// skipNullProperties: false — см. update-article-faq.dto.ts (M2 code review).
export class UpdateLandingFaqDto extends PartialType(CreateLandingFaqDto, {
  skipNullProperties: false,
}) {}

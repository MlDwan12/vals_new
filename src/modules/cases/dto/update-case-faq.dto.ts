import { PartialType } from '@nestjs/mapped-types';
import { CreateCaseFaqDto } from './create-case-faq.dto';

// skipNullProperties: false — см. update-article-faq.dto.ts (M2 code review).
export class UpdateCaseFaqDto extends PartialType(CreateCaseFaqDto, {
  skipNullProperties: false,
}) {}

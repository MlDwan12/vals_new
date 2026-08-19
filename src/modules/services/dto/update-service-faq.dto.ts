import { PartialType } from '@nestjs/mapped-types';
import { CreateServiceFaqDto } from './create-service-faq.dto';

// skipNullProperties: false — см. update-article-faq.dto.ts (M2 code review).
export class UpdateServiceFaqDto extends PartialType(CreateServiceFaqDto, {
  skipNullProperties: false,
}) {}

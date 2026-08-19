import { PartialType } from '@nestjs/mapped-types';
import { CreateServiceStepDto } from './create-service-step.dto';

// skipNullProperties: false — см. update-article-faq.dto.ts (M2 code review).
export class UpdateServiceStepDto extends PartialType(CreateServiceStepDto, {
  skipNullProperties: false,
}) {}

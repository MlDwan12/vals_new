import { PartialType } from '@nestjs/mapped-types';
import { CreateServiceDto } from './create-service.dto';

// skipNullProperties: false — см. update-article-faq.dto.ts (M2 code review).
export class UpdateServiceDto extends PartialType(CreateServiceDto, {
  skipNullProperties: false,
}) {}

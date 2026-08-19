import { PartialType } from '@nestjs/mapped-types';
import { CreateServiceCategoryDto } from './create-service-category.dto';

// skipNullProperties: false — см. update-article-faq.dto.ts (M2 code review).
export class UpdateServiceCategoryDto extends PartialType(
  CreateServiceCategoryDto,
  { skipNullProperties: false },
) {}

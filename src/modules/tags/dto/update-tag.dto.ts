import { PartialType } from '@nestjs/mapped-types';
import { CreateTagDto } from './create-tag.dto';

// skipNullProperties: false — см. update-article-faq.dto.ts (M2 code review).
export class UpdateTagDto extends PartialType(CreateTagDto, {
  skipNullProperties: false,
}) {}

import { PartialType } from '@nestjs/mapped-types';
import { CreateCaseDto } from './create-case.dto';

// skipNullProperties: false — см. update-article-faq.dto.ts (M2 code review). datePublished — как
// и у статей, обрабатывается отдельно (см. update-article.dto.ts), сюда не относится.
export class UpdateCaseDto extends PartialType(CreateCaseDto, {
  skipNullProperties: false,
}) {}

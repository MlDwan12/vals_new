import { PartialType } from '@nestjs/mapped-types';
import { CreateArticleFaqDto } from './create-article-faq.dto';

// skipNullProperties: false — явный `null` в PATCH проходит валидацию (400), а не падает
// not-null violation'ом в БД (M2 code review).
export class UpdateArticleFaqDto extends PartialType(CreateArticleFaqDto, {
  skipNullProperties: false,
}) {}

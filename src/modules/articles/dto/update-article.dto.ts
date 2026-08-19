import { PartialType } from '@nestjs/mapped-types';
import { CreateArticleDto } from './create-article.dto';

// skipNullProperties: false — см. update-article-faq.dto.ts (M2 code review). datePublished
// обрабатывается отдельно от PartialType-полей (в ArticlesService.update, вне applyDefinedFields)
// именно потому, что там `null` — легитимное значение (снять с публикации), это не затрагивается.
export class UpdateArticleDto extends PartialType(CreateArticleDto, {
  skipNullProperties: false,
}) {}

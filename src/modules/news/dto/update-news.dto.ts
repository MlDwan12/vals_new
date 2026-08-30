import { PartialType } from '@nestjs/mapped-types';
import { CreateNewsDto } from './create-news.dto';

// skipNullProperties: false — см. update-article.dto.ts (M2 code review). datePublished
// обрабатывается отдельно от PartialType-полей (в NewsService.update, вне applyDefinedFields)
// именно потому, что там `null` — легитимное значение (снять с публикации).
export class UpdateNewsDto extends PartialType(CreateNewsDto, {
  skipNullProperties: false,
}) {}

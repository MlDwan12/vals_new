import { PaginatedResult } from '../../../core/pagination/paginated-result.interface';
import { GlobalSearchDocument } from '../application/global-search-document.interface';

export type SearchResultDto = PaginatedResult<GlobalSearchDocument> & {
  query: string;
};

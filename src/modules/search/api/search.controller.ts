import { Controller, Get, Query } from '@nestjs/common';
import { Public } from '../../../core/decorators/public.decorator';
import { buildPaginatedResult } from '../../../core/pagination/paginated-result.interface';
import { SearchIndexService } from '../application/search-index.service';
import { SearchQueryDto } from '../dto/search-query.dto';
import { SearchResultDto } from '../dto/search-result.dto';

@Controller('search')
export class SearchController {
  constructor(private readonly searchIndexService: SearchIndexService) {}

  @Get()
  @Public()
  async search(@Query() query: SearchQueryDto): Promise<SearchResultDto> {
    const { items, total } = await this.searchIndexService.search(
      query.q,
      query.page,
      query.limit,
    );
    return {
      query: query.q,
      ...buildPaginatedResult(items, total, query.page, query.limit),
    };
  }
}

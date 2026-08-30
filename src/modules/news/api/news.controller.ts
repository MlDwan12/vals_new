import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../../../core/decorators/public.decorator';
import { PaginatedResult } from '../../../core/pagination/paginated-result.interface';
import { NewsService } from '../application/news.service';
import { NewsListQueryDto } from '../dto/news-list-query.dto';
import { NewsMainInfoDto } from '../dto/news-main-info.dto';
import { NewsResponseDto } from '../dto/news-response.dto';
import { NewsSitemapItemDto } from '../dto/news-sitemap-item.dto';
import { SimilarNewsQueryDto } from '../dto/similar-news-query.dto';

@Controller('news')
export class NewsController {
  constructor(private readonly newsService: NewsService) {}

  @Public()
  @Get('similar')
  findSimilar(@Query() query: SimilarNewsQueryDto): Promise<NewsMainInfoDto[]> {
    return this.newsService.findSimilarPublished(
      query.tagIds,
      query.excludeId,
      query.limit,
    );
  }

  @Public()
  @Get('published/main-info')
  findPublishedList(
    @Query() query: NewsListQueryDto,
  ): Promise<PaginatedResult<NewsMainInfoDto>> {
    return this.newsService.findPublishedList(query);
  }

  @Public()
  @Get('published/all')
  findAllPublishedSitemapItems(): Promise<NewsSitemapItemDto[]> {
    return this.newsService.findAllPublishedSitemapItems();
  }

  @Public()
  @Get('info/:slug')
  findBySlug(@Param('slug') slug: string): Promise<NewsResponseDto> {
    return this.newsService.findBySlugPublished(slug);
  }
}

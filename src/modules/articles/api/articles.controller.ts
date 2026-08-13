import { Controller, Get, Param, Query } from '@nestjs/common';
import { Public } from '../../../core/decorators/public.decorator';
import { PaginatedResult } from '../../../core/pagination/paginated-result.interface';
import { ArticlesService } from '../application/articles.service';
import { ArticleListQueryDto } from '../dto/article-list-query.dto';
import { ArticleMainInfoDto } from '../dto/article-main-info.dto';
import { ArticleResponseDto } from '../dto/article-response.dto';
import { ArticleSitemapItemDto } from '../dto/article-sitemap-item.dto';
import { SimilarArticlesQueryDto } from '../dto/similar-articles-query.dto';

@Controller('articles')
export class ArticlesController {
  constructor(private readonly articlesService: ArticlesService) {}

  @Public()
  @Get('similar')
  findSimilar(
    @Query() query: SimilarArticlesQueryDto,
  ): Promise<ArticleMainInfoDto[]> {
    return this.articlesService.findSimilarPublished(
      query.tagIds,
      query.excludeId,
      query.limit,
    );
  }

  @Public()
  @Get('published/main-info')
  findPublishedList(
    @Query() query: ArticleListQueryDto,
  ): Promise<PaginatedResult<ArticleMainInfoDto>> {
    return this.articlesService.findPublishedList(query);
  }

  @Public()
  @Get('published/all')
  findAllPublishedSitemapItems(): Promise<ArticleSitemapItemDto[]> {
    return this.articlesService.findAllPublishedSitemapItems();
  }

  @Public()
  @Get('info/:slug')
  findBySlug(@Param('slug') slug: string): Promise<ArticleResponseDto> {
    return this.articlesService.findBySlugPublished(slug);
  }
}

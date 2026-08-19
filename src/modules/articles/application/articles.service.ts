import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PaginatedResult } from '../../../core/pagination/paginated-result.interface';
import { applyDefinedFields } from '../../../core/persistence/apply-defined-fields.util';
import { isUniqueViolation } from '../../../core/persistence/postgres-error.util';
import {
  resolveOptionalEntitiesByIds,
  resolveRequiredEntitiesByIds,
} from '../../../core/persistence/resolve-entities-by-ids.util';
import { EmployeesRepository } from '../../employees/infrastructure/employees.repository';
import { SearchIndexService } from '../../search/application/search-index.service';
import { TagsRepository } from '../../tags/infrastructure/tags.repository';
import { ArticleFaqService } from './article-faq.service';
import {
  articleFaqDocumentIds,
  buildArticleSearchDocument,
  isArticlePublished,
} from './article-search-document.util';
import { Article } from '../domain/article.entity';
import { ArticleListQueryDto } from '../dto/article-list-query.dto';
import { ArticleMainInfoDto } from '../dto/article-main-info.dto';
import { ArticleResponseDto } from '../dto/article-response.dto';
import { ArticleSitemapItemDto } from '../dto/article-sitemap-item.dto';
import { CreateArticleDto } from '../dto/create-article.dto';
import { UpdateArticleDto } from '../dto/update-article.dto';
import { ArticlesRepository } from '../infrastructure/articles.repository';

@Injectable()
export class ArticlesService {
  constructor(
    private readonly articlesRepository: ArticlesRepository,
    private readonly employeesRepository: EmployeesRepository,
    private readonly tagsRepository: TagsRepository,
    private readonly searchIndexService: SearchIndexService,
    private readonly articleFaqService: ArticleFaqService,
  ) {}

  async create(dto: CreateArticleDto): Promise<ArticleResponseDto> {
    const [authors, tags] = await Promise.all([
      resolveRequiredEntitiesByIds(
        dto.authorIds,
        (ids) => this.employeesRepository.findByIds(ids),
        'Сотрудники',
        'authorIds',
      ),
      resolveOptionalEntitiesByIds(
        dto.tagIds,
        (ids) => this.tagsRepository.findByIds(ids),
        'Теги',
      ),
    ]);

    const article = this.articlesRepository.create({
      slug: dto.slug,
      title: dto.title,
      description: dto.description,
      content: dto.content,
      contentHtml: dto.contentHtml,
      metaTitle: dto.metaTitle,
      metaDescription: dto.metaDescription,
      keywords: dto.keywords,
      datePublished: dto.datePublished ? new Date(dto.datePublished) : null,
      priority: dto.priority ?? 0,
      readingTime: dto.readingTime ?? null,
      hasToc: dto.hasToc ?? false,
      authors,
      tags,
    });

    try {
      const saved = await this.articlesRepository.save(article);
      const entity = await this.findEntityByIdOrFail(saved.id);
      await this.indexArticle(entity);
      return ArticleResponseDto.fromEntity(entity);
    } catch (error) {
      throw this.mapSlugConflict(error);
    }
  }

  async update(id: number, dto: UpdateArticleDto): Promise<ArticleResponseDto> {
    const article = await this.findEntityByIdOrFail(id);

    if (dto.authorIds !== undefined) {
      article.authors = await resolveRequiredEntitiesByIds(
        dto.authorIds,
        (ids) => this.employeesRepository.findByIds(ids),
        'Сотрудники',
        'authorIds',
      );
    }
    if (dto.tagIds !== undefined) {
      article.tags = await resolveOptionalEntitiesByIds(
        dto.tagIds,
        (ids) => this.tagsRepository.findByIds(ids),
        'Теги',
      );
    }
    // datePublished — отдельно от общего хелпера ниже: значение нужно конвертировать в Date,
    // а простое присутствие ключа в DTO (в т.ч. null) уже отличает "не трогать" от "обнулить".
    if ('datePublished' in dto) {
      article.datePublished = dto.datePublished
        ? new Date(dto.datePublished)
        : null;
    }

    applyDefinedFields(article, {
      slug: dto.slug,
      title: dto.title,
      description: dto.description,
      content: dto.content,
      contentHtml: dto.contentHtml,
      metaTitle: dto.metaTitle,
      metaDescription: dto.metaDescription,
      keywords: dto.keywords,
      priority: dto.priority,
      readingTime: dto.readingTime,
      hasToc: dto.hasToc,
    });

    try {
      const saved = await this.articlesRepository.save(article);
      const entity = await this.findEntityByIdOrFail(saved.id);
      await this.indexArticle(entity);
      return ArticleResponseDto.fromEntity(entity);
    } catch (error) {
      throw this.mapSlugConflict(error);
    }
  }

  async remove(id: number): Promise<void> {
    const article = await this.findEntityByIdOrFail(id);
    await this.articlesRepository.remove(id);
    // CASCADE в БД удаляет article_faq вместе со статьёй — документы FAQ из индекса поиска сами
    // не исчезают, чистим их здесь же по уже загруженной relations.faq (findEntityByIdOrFail).
    await this.searchIndexService.deleteDocuments([
      `article_${id}`,
      ...articleFaqDocumentIds(article),
    ]);
  }

  // Полная переиндексация (admin) — статьи + их FAQ одним вызовом, без отдельного эндпоинта
  // на FAQ (в новой схеме это часть переиндексации статей, не самостоятельный раздел поиска).
  async reindexSearch(): Promise<void> {
    const now = new Date();
    const [articles, faqDocs] = await Promise.all([
      this.articlesRepository.findAllForSearchIndex(),
      this.articleFaqService.buildAllSearchDocuments(now),
    ]);
    const publishedDocs = articles
      .filter(
        (article) =>
          article.datePublished !== null && article.datePublished <= now,
      )
      .map((article) => buildArticleSearchDocument(article));

    await this.searchIndexService.upsertDocuments([
      ...publishedDocs,
      ...faqDocs,
    ]);
  }

  async findById(id: number): Promise<ArticleResponseDto> {
    return ArticleResponseDto.fromEntity(await this.findEntityByIdOrFail(id));
  }

  async findBySlugPublished(slug: string): Promise<ArticleResponseDto> {
    const article = await this.articlesRepository.findBySlugPublished(slug);
    if (!article) {
      throw new NotFoundException(`Статья со slug "${slug}" не найдена`);
    }
    return ArticleResponseDto.fromEntity(article);
  }

  async findList(
    query: ArticleListQueryDto,
  ): Promise<PaginatedResult<ArticleMainInfoDto>> {
    const result = await this.articlesRepository.findMainInfoList(query);
    return {
      ...result,
      items: result.items.map((article) =>
        ArticleMainInfoDto.fromEntity(article),
      ),
    };
  }

  // Публичный список сайта — только опубликованные (datePublished <= now).
  async findPublishedList(
    query: ArticleListQueryDto,
  ): Promise<PaginatedResult<ArticleMainInfoDto>> {
    const result =
      await this.articlesRepository.findPublishedMainInfoList(query);
    return {
      ...result,
      items: result.items.map((article) =>
        ArticleMainInfoDto.fromEntity(article),
      ),
    };
  }

  findAllPublishedSitemapItems(): Promise<ArticleSitemapItemDto[]> {
    return this.articlesRepository.findAllPublishedSitemapItems();
  }

  async findSimilarPublished(
    tagIds: number[],
    excludeId: number | undefined,
    limit: number,
  ): Promise<ArticleMainInfoDto[]> {
    if (!tagIds.length) return [];

    const ids = await this.articlesRepository.findSimilarRankedIds(
      tagIds,
      excludeId,
      limit,
    );
    const articles = await this.articlesRepository.findMainInfoByIds(ids);
    return articles.map((article) => ArticleMainInfoDto.fromEntity(article));
  }

  private async findEntityByIdOrFail(id: number): Promise<Article> {
    const article = await this.articlesRepository.findById(id);
    if (!article) {
      throw new NotFoundException(`Статья с ID ${id} не найдена`);
    }
    return article;
  }

  private mapSlugConflict(error: unknown): unknown {
    if (isUniqueViolation(error)) {
      return new ConflictException('Статья с таким slug уже существует');
    }
    return error;
  }

  // Черновик/отложенная статья не должна утекать в публичный поиск (ТЗ §2 — только опубликованный
  // контент виден на сайте; старый код индексировал вообще без проверки публикации).
  private async indexArticle(article: Article): Promise<void> {
    if (isArticlePublished(article)) {
      await this.searchIndexService.upsertDocuments([
        buildArticleSearchDocument(article),
      ]);
    } else {
      await this.searchIndexService.deleteDocuments([`article_${article.id}`]);
    }
  }
}

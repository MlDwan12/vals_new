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
  resolveOptionalEntityById,
  resolveRequiredEntitiesByIds,
} from '../../../core/persistence/resolve-entities-by-ids.util';
import { EmployeesRepository } from '../../employees/infrastructure/employees.repository';
import { MediaRepository } from '../../media/infrastructure/media.repository';
import { SearchIndexService } from '../../search/application/search-index.service';
import { TagsRepository } from '../../tags/infrastructure/tags.repository';
import {
  buildNewsSearchDocument,
  isNewsPublished,
} from './news-search-document.util';
import { News } from '../domain/news.entity';
import { CreateNewsDto } from '../dto/create-news.dto';
import { NewsListQueryDto } from '../dto/news-list-query.dto';
import { NewsMainInfoDto } from '../dto/news-main-info.dto';
import { NewsResponseDto } from '../dto/news-response.dto';
import { NewsSitemapItemDto } from '../dto/news-sitemap-item.dto';
import { UpdateNewsDto } from '../dto/update-news.dto';
import { NewsRepository } from '../infrastructure/news.repository';

@Injectable()
export class NewsService {
  constructor(
    private readonly newsRepository: NewsRepository,
    private readonly employeesRepository: EmployeesRepository,
    private readonly mediaRepository: MediaRepository,
    private readonly tagsRepository: TagsRepository,
    private readonly searchIndexService: SearchIndexService,
  ) {}

  async create(dto: CreateNewsDto): Promise<NewsResponseDto> {
    const [authors, tags, cover] = await Promise.all([
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
      this.resolveCover(dto.coverMediaId),
    ]);

    const news = this.newsRepository.create({
      slug: dto.slug,
      title: dto.title,
      announce: dto.announce,
      content: dto.content,
      contentHtml: dto.contentHtml,
      metaTitle: dto.metaTitle,
      metaDescription: dto.metaDescription,
      keywords: dto.keywords,
      datePublished: dto.datePublished ? new Date(dto.datePublished) : null,
      priority: dto.priority ?? 0,
      cover,
      authors,
      tags,
    });

    try {
      const saved = await this.newsRepository.save(news);
      const entity = await this.findEntityByIdOrFail(saved.id);
      await this.indexNews(entity);
      return NewsResponseDto.fromEntity(entity);
    } catch (error) {
      throw this.mapSlugConflict(error);
    }
  }

  async update(id: number, dto: UpdateNewsDto): Promise<NewsResponseDto> {
    const news = await this.findEntityByIdOrFail(id);

    if (dto.authorIds !== undefined) {
      news.authors = await resolveRequiredEntitiesByIds(
        dto.authorIds,
        (ids) => this.employeesRepository.findByIds(ids),
        'Сотрудники',
        'authorIds',
      );
    }
    if (dto.tagIds !== undefined) {
      news.tags = await resolveOptionalEntitiesByIds(
        dto.tagIds,
        (ids) => this.tagsRepository.findByIds(ids),
        'Теги',
      );
    }
    if (dto.coverMediaId !== undefined) {
      // Присваиваем саму relation-сущность, не FK-скаляр — см. ArticlesService.update, тот же
      // приём и та же причина (уже загруженная news.cover иначе переопределяет FK при save()).
      news.cover = await this.resolveCover(dto.coverMediaId);
    }
    // datePublished — отдельно от общего хелпера ниже: значение нужно конвертировать в Date,
    // а простое присутствие ключа в DTO (в т.ч. null) уже отличает "не трогать" от "обнулить".
    if ('datePublished' in dto) {
      news.datePublished = dto.datePublished
        ? new Date(dto.datePublished)
        : null;
    }

    applyDefinedFields(news, {
      slug: dto.slug,
      title: dto.title,
      announce: dto.announce,
      content: dto.content,
      contentHtml: dto.contentHtml,
      metaTitle: dto.metaTitle,
      metaDescription: dto.metaDescription,
      keywords: dto.keywords,
      priority: dto.priority,
    });

    try {
      const saved = await this.newsRepository.save(news);
      const entity = await this.findEntityByIdOrFail(saved.id);
      await this.indexNews(entity);
      return NewsResponseDto.fromEntity(entity);
    } catch (error) {
      throw this.mapSlugConflict(error);
    }
  }

  async remove(id: number): Promise<void> {
    const removed = await this.newsRepository.remove(id);
    if (!removed) {
      throw new NotFoundException(`Новость с ID ${id} не найдена`);
    }
    await this.searchIndexService.deleteDocuments([`news_${id}`]);
  }

  // Полная переиндексация (admin + периодический тик) — по образцу ArticlesService.reindexSearch.
  async reindexSearch(): Promise<void> {
    const now = new Date();
    const allNews = await this.newsRepository.findAllForSearchIndex();
    const publishedDocs = allNews
      .filter(
        (news) => news.datePublished !== null && news.datePublished <= now,
      )
      .map((news) => buildNewsSearchDocument(news));

    await this.searchIndexService.upsertDocuments(publishedDocs);
    // 'newsFaq_' никогда не совпадёт ни с одним документом — у новостей нет FAQ, но
    // reconcileStaleDocuments всё равно требует параметр (общий метод для всех доменов).
    await this.searchIndexService.reconcileStaleDocuments(
      'news',
      'newsFaq_',
      new Set(publishedDocs.map((doc) => doc.id)),
    );
  }

  async findById(id: number): Promise<NewsResponseDto> {
    return NewsResponseDto.fromEntity(await this.findEntityByIdOrFail(id));
  }

  async findBySlugPublished(slug: string): Promise<NewsResponseDto> {
    const news = await this.newsRepository.findBySlugPublished(slug);
    if (!news) {
      throw new NotFoundException(`Новость со slug "${slug}" не найдена`);
    }
    return NewsResponseDto.fromEntity(news);
  }

  async findList(
    query: NewsListQueryDto,
  ): Promise<PaginatedResult<NewsMainInfoDto>> {
    const result = await this.newsRepository.findMainInfoList(query);
    return {
      ...result,
      items: result.items.map((news) => NewsMainInfoDto.fromEntity(news)),
    };
  }

  // Публичный список сайта — только опубликованные (datePublished <= now).
  async findPublishedList(
    query: NewsListQueryDto,
  ): Promise<PaginatedResult<NewsMainInfoDto>> {
    const result = await this.newsRepository.findPublishedMainInfoList(query);
    return {
      ...result,
      items: result.items.map((news) => NewsMainInfoDto.fromEntity(news)),
    };
  }

  findAllPublishedSitemapItems(): Promise<NewsSitemapItemDto[]> {
    return this.newsRepository.findAllPublishedSitemapItems();
  }

  async findSimilarPublished(
    tagIds: number[],
    excludeId: number | undefined,
    limit: number,
  ): Promise<NewsMainInfoDto[]> {
    if (!tagIds.length) return [];

    const ids = await this.newsRepository.findSimilarRankedIds(
      tagIds,
      excludeId,
      limit,
    );
    const news = await this.newsRepository.findMainInfoByIds(ids);
    return news.map((item) => NewsMainInfoDto.fromEntity(item));
  }

  private async findEntityByIdOrFail(id: number): Promise<News> {
    const news = await this.newsRepository.findById(id);
    if (!news) {
      throw new NotFoundException(`Новость с ID ${id} не найдена`);
    }
    return news;
  }

  private mapSlugConflict(error: unknown): unknown {
    if (isUniqueViolation(error)) {
      return new ConflictException('Новость с таким slug уже существует');
    }
    return error;
  }

  private resolveCover(coverMediaId: number | null | undefined) {
    return resolveOptionalEntityById(
      coverMediaId,
      (id) => this.mediaRepository.findById(id),
      'Обложка',
    );
  }

  // Черновик/отложенная новость не должна утекать в публичный поиск — тот же принцип, что у
  // статей/кейсов (ТЗ §2).
  private async indexNews(news: News): Promise<void> {
    if (isNewsPublished(news)) {
      await this.searchIndexService.upsertDocuments([
        buildNewsSearchDocument(news),
      ]);
    } else {
      await this.searchIndexService.deleteDocuments([`news_${news.id}`]);
    }
  }
}

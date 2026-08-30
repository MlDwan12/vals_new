import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository, SelectQueryBuilder } from 'typeorm';
import { assertRawRowShape } from '../../../core/persistence/assert-raw-row-shape.util';
import { escapeLikePattern } from '../../../core/persistence/escape-like-pattern.util';
import {
  applyAuthorSlugFilter,
  applyTagSlugFilter,
  AUTHOR_SHORT_FIELDS,
  TAG_SHORT_FIELDS,
} from '../../../core/persistence/author-tag-relation-filters.util';
import { MEDIA_COVER_SHORT_FIELDS } from '../../../core/persistence/media-cover-fields.util';
import { SortByDate } from '../../../core/enums/sort-by-date.enum';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../../core/pagination/paginated-result.interface';
import { News } from '../domain/news.entity';
import { NewsListQueryDto } from '../dto/news-list-query.dto';
import { NewsSitemapItemDto } from '../dto/news-sitemap-item.dto';

const NEWS_MAIN_FIELDS = [
  'news.id',
  'news.slug',
  'news.title',
  'news.announce',
  'news.datePublished',
  'news.priority',
  'news.createdAt',
  'news.updatedAt',
];

const SORT_COLUMN: Record<
  SortByDate,
  { column: string; direction: 'ASC' | 'DESC' }
> = {
  [SortByDate.UPDATED_DESC]: { column: 'news.updatedAt', direction: 'DESC' },
  [SortByDate.UPDATED_ASC]: { column: 'news.updatedAt', direction: 'ASC' },
  [SortByDate.CREATED_DESC]: { column: 'news.createdAt', direction: 'DESC' },
  [SortByDate.CREATED_ASC]: { column: 'news.createdAt', direction: 'ASC' },
  [SortByDate.PUBLISHED_DESC]: {
    column: 'news.datePublished',
    direction: 'DESC',
  },
  [SortByDate.PUBLISHED_ASC]: {
    column: 'news.datePublished',
    direction: 'ASC',
  },
};

const AUTHOR_JOIN = {
  entityAlias: 'news',
  joinTable: 'news_authors',
  entityIdColumn: 'news_id',
};

const TAG_JOIN = {
  entityAlias: 'news',
  joinTable: 'news_tags',
  entityIdColumn: 'news_id',
};

@Injectable()
export class NewsRepository {
  constructor(
    @InjectRepository(News) private readonly repo: Repository<News>,
  ) {}

  private mainInfoQuery(query: NewsListQueryDto): SelectQueryBuilder<News> {
    const qb = this.repo
      .createQueryBuilder('news')
      .leftJoin('news.authors', 'author')
      .leftJoin('news.tags', 'tag')
      .leftJoin('news.cover', 'cover')
      .select(NEWS_MAIN_FIELDS)
      .addSelect(AUTHOR_SHORT_FIELDS)
      .addSelect(TAG_SHORT_FIELDS)
      .addSelect(MEDIA_COVER_SHORT_FIELDS)
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    if (query.search) {
      qb.andWhere('news.title ILIKE :search', {
        search: `%${escapeLikePattern(query.search)}%`,
      });
    }
    applyAuthorSlugFilter(qb, AUTHOR_JOIN, query.authorSlug);
    applyTagSlugFilter(qb, TAG_JOIN, query.tagSlug);

    return qb;
  }

  async findMainInfoList(
    query: NewsListQueryDto,
  ): Promise<PaginatedResult<News>> {
    const sort = SORT_COLUMN[query.sortBy ?? SortByDate.CREATED_DESC];
    const qb = this.mainInfoQuery(query).orderBy(sort.column, sort.direction);

    const [items, total] = await qb.getManyAndCount();
    return buildPaginatedResult(items, total, query.page, query.limit);
  }

  // Публичный список сайта — только опубликованные (datePublished <= now).
  async findPublishedMainInfoList(
    query: NewsListQueryDto,
  ): Promise<PaginatedResult<News>> {
    const sort = SORT_COLUMN[query.sortBy ?? SortByDate.PUBLISHED_DESC];
    const qb = this.mainInfoQuery(query)
      .andWhere('news.datePublished IS NOT NULL')
      .andWhere('news.datePublished <= :now', { now: new Date() })
      .orderBy('news.priority', 'DESC')
      .addOrderBy(sort.column, sort.direction)
      .addOrderBy('news.id', 'DESC');

    const [items, total] = await qb.getManyAndCount();
    return buildPaginatedResult(items, total, query.page, query.limit);
  }

  // Все опубликованные новости без пагинации — sitemap.xml и человекочитаемая карта сайта.
  async findAllPublishedSitemapItems(): Promise<NewsSitemapItemDto[]> {
    const rows = await this.repo
      .createQueryBuilder('news')
      .select('news.slug', 'slug')
      .addSelect('news.title', 'title')
      .addSelect('news.updatedAt', 'updatedAt')
      .where('news.datePublished IS NOT NULL')
      .andWhere('news.datePublished <= :now', { now: new Date() })
      .orderBy('news.datePublished', 'DESC')
      .getRawMany<NewsSitemapItemDto>();

    rows.forEach((row) =>
      assertRawRowShape(
        row,
        { slug: 'string', title: 'string' },
        'findAllPublishedSitemapItems',
      ),
    );
    return rows;
  }

  findBySlug(slug: string): Promise<News | null> {
    return this.repo.findOne({
      where: { slug },
      relations: { authors: true, tags: true, cover: true },
    });
  }

  findBySlugPublished(slug: string): Promise<News | null> {
    return this.repo.findOne({
      where: { slug, datePublished: LessThanOrEqual(new Date()) },
      relations: { authors: true, tags: true, cover: true },
    });
  }

  findById(id: number): Promise<News | null> {
    return this.repo.findOne({
      where: { id },
      relations: { authors: true, tags: true, cover: true },
    });
  }

  // Похожие новости (шаг 1) — id опубликованных новостей, ранжированные по числу совпавших тегов.
  async findSimilarRankedIds(
    tagIds: number[],
    excludeId: number | undefined,
    limit: number,
  ): Promise<number[]> {
    const qb = this.repo
      .createQueryBuilder('news')
      .innerJoin('news_tags', 'nt', 'nt.news_id = news.id')
      .select('news.id', 'id')
      .addSelect('COUNT(DISTINCT nt.tag_id)', 'matched')
      .where('nt.tag_id IN (:...tagIds)', { tagIds })
      .andWhere('news.datePublished IS NOT NULL')
      .andWhere('news.datePublished <= :now', { now: new Date() })
      .groupBy('news.id')
      .orderBy('matched', 'DESC')
      .addOrderBy('news.priority', 'DESC')
      .addOrderBy('news.datePublished', 'DESC')
      .limit(limit);

    if (excludeId) {
      qb.andWhere('news.id != :excludeId', { excludeId });
    }

    const rows = await qb.getRawMany<{ id: number; matched: string }>();
    rows.forEach((row) =>
      assertRawRowShape(row, { id: 'number' }, 'findSimilarRankedIds'),
    );
    return rows.map((row) => row.id);
  }

  // Похожие новости (шаг 2) — main-info по уже ранжированным id, порядок из шага 1 сохраняется.
  async findMainInfoByIds(ids: number[]): Promise<News[]> {
    if (!ids.length) return [];

    const items = await this.repo
      .createQueryBuilder('news')
      .leftJoin('news.authors', 'author')
      .leftJoin('news.tags', 'tag')
      .leftJoin('news.cover', 'cover')
      .select(NEWS_MAIN_FIELDS)
      .addSelect(AUTHOR_SHORT_FIELDS)
      .addSelect(TAG_SHORT_FIELDS)
      .addSelect(MEDIA_COVER_SHORT_FIELDS)
      .where('news.id IN (:...ids)', { ids })
      .getMany();

    const order = new Map(ids.map((id, index) => [id, index]));
    return items.sort(
      (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
    );
  }

  // Полный список для reindex — только поля, нужные для поискового документа, без relations.
  findAllForSearchIndex(): Promise<
    Pick<News, 'id' | 'slug' | 'title' | 'announce' | 'datePublished'>[]
  > {
    return this.repo.find({
      select: {
        id: true,
        slug: true,
        title: true,
        announce: true,
        datePublished: true,
      },
    });
  }

  create(data: {
    slug: string;
    title: string;
    announce?: string;
    content: Record<string, unknown>;
    contentHtml?: string;
    metaTitle?: string;
    metaDescription?: string;
    keywords?: string;
    datePublished: Date | null;
    priority: number;
    cover: News['cover'];
    authors: News['authors'];
    tags: News['tags'];
  }): News {
    return this.repo.create(data);
  }

  save(news: News): Promise<News> {
    return this.repo.save(news);
  }

  // Возвращает false, если строки с таким id не было — вызывающему не нужен отдельный
  // предварительный findById с загрузкой relations только ради 404-проверки (efficiency review,
  // /simplify: у news, в отличие от articles/cases, нет FAQ, ради которого та полная загрузка была
  // оправдана).
  async remove(id: number): Promise<boolean> {
    const result = await this.repo.delete(id);
    return (result.affected ?? 0) > 0;
  }
}

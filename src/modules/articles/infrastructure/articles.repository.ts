import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository, SelectQueryBuilder } from 'typeorm';
import {
  countPublicationStats,
  PublicationStats,
} from '../../../core/persistence/count-publication-stats.util';
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
import { Article } from '../domain/article.entity';
import { ArticleListQueryDto } from '../dto/article-list-query.dto';
import { ArticleSitemapItemDto } from '../dto/article-sitemap-item.dto';

const ARTICLE_MAIN_FIELDS = [
  'article.id',
  'article.slug',
  'article.title',
  'article.description',
  'article.datePublished',
  'article.priority',
  'article.readingTime',
  'article.createdAt',
  'article.updatedAt',
];

const SORT_COLUMN: Record<
  SortByDate,
  { column: string; direction: 'ASC' | 'DESC' }
> = {
  [SortByDate.UPDATED_DESC]: { column: 'article.updatedAt', direction: 'DESC' },
  [SortByDate.UPDATED_ASC]: { column: 'article.updatedAt', direction: 'ASC' },
  [SortByDate.CREATED_DESC]: { column: 'article.createdAt', direction: 'DESC' },
  [SortByDate.CREATED_ASC]: { column: 'article.createdAt', direction: 'ASC' },
  [SortByDate.PUBLISHED_DESC]: {
    column: 'article.datePublished',
    direction: 'DESC',
  },
  [SortByDate.PUBLISHED_ASC]: {
    column: 'article.datePublished',
    direction: 'ASC',
  },
};

const AUTHOR_JOIN = {
  entityAlias: 'article',
  joinTable: 'article_authors',
  entityIdColumn: 'article_id',
};

const TAG_JOIN = {
  entityAlias: 'article',
  joinTable: 'article_tags',
  entityIdColumn: 'article_id',
};

@Injectable()
export class ArticlesRepository {
  constructor(
    @InjectRepository(Article) private readonly repo: Repository<Article>,
  ) {}

  private mainInfoQuery(
    query: ArticleListQueryDto,
  ): SelectQueryBuilder<Article> {
    const qb = this.repo
      .createQueryBuilder('article')
      .leftJoin('article.authors', 'author')
      .leftJoin('article.tags', 'tag')
      .leftJoin('article.cover', 'cover')
      .select(ARTICLE_MAIN_FIELDS)
      .addSelect(AUTHOR_SHORT_FIELDS)
      .addSelect(TAG_SHORT_FIELDS)
      .addSelect(MEDIA_COVER_SHORT_FIELDS)
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    if (query.search) {
      qb.andWhere('article.title ILIKE :search', {
        search: `%${escapeLikePattern(query.search)}%`,
      });
    }
    applyAuthorSlugFilter(qb, AUTHOR_JOIN, query.authorSlug);
    applyTagSlugFilter(qb, TAG_JOIN, query.tagSlug);

    return qb;
  }

  async findMainInfoList(
    query: ArticleListQueryDto,
  ): Promise<PaginatedResult<Article>> {
    const sort = SORT_COLUMN[query.sortBy ?? SortByDate.CREATED_DESC];
    const qb = this.mainInfoQuery(query).orderBy(sort.column, sort.direction);

    const [items, total] = await qb.getManyAndCount();
    return buildPaginatedResult(items, total, query.page, query.limit);
  }

  // Публичный список сайта — только опубликованные (datePublished <= now).
  async findPublishedMainInfoList(
    query: ArticleListQueryDto,
  ): Promise<PaginatedResult<Article>> {
    const sort = SORT_COLUMN[query.sortBy ?? SortByDate.PUBLISHED_DESC];
    const qb = this.mainInfoQuery(query)
      .andWhere('article.datePublished IS NOT NULL')
      .andWhere('article.datePublished <= :now', { now: new Date() })
      .orderBy('article.priority', 'DESC')
      .addOrderBy(sort.column, sort.direction)
      .addOrderBy('article.id', 'DESC');

    const [items, total] = await qb.getManyAndCount();
    return buildPaginatedResult(items, total, query.page, query.limit);
  }

  // Все опубликованные статьи без пагинации — sitemap.xml и человекочитаемая карта сайта.
  async findAllPublishedSitemapItems(): Promise<ArticleSitemapItemDto[]> {
    const rows = await this.repo
      .createQueryBuilder('article')
      .select('article.slug', 'slug')
      .addSelect('article.title', 'title')
      .addSelect('article.updatedAt', 'updatedAt')
      .where('article.datePublished IS NOT NULL')
      .andWhere('article.datePublished <= :now', { now: new Date() })
      .orderBy('article.datePublished', 'DESC')
      .getRawMany<ArticleSitemapItemDto>();

    rows.forEach((row) =>
      assertRawRowShape(
        row,
        { slug: 'string', title: 'string' },
        'findAllPublishedSitemapItems',
      ),
    );
    return rows;
  }

  findBySlugPublished(slug: string): Promise<Article | null> {
    return this.repo.findOne({
      where: { slug, datePublished: LessThanOrEqual(new Date()) },
      relations: { authors: true, tags: true, faq: true, cover: true },
      order: { faq: { id: 'ASC' } },
    });
  }

  findById(id: number): Promise<Article | null> {
    return this.repo.findOne({
      where: { id },
      relations: { authors: true, tags: true, faq: true, cover: true },
      order: { faq: { id: 'ASC' } },
    });
  }

  // Для FAQ-сервиса (ArticleFaqService.resolveArticle) — проверка существования родителя +
  // slug/datePublished для построения поискового документа, без тяжёлого findById с
  // authors/tags/faq (которые FAQ-мутации не используют).
  findPublicationMetaById(
    id: number,
  ): Promise<Pick<Article, 'id' | 'slug' | 'datePublished'> | null> {
    return this.repo.findOne({
      where: { id },
      select: { id: true, slug: true, datePublished: true },
    });
  }

  // Похожие статьи (шаг 1) — id опубликованных статей, ранжированные по числу совпавших тегов.
  async findSimilarRankedIds(
    tagIds: number[],
    excludeId: number | undefined,
    limit: number,
  ): Promise<number[]> {
    const qb = this.repo
      .createQueryBuilder('article')
      .innerJoin('article_tags', 'at', 'at.article_id = article.id')
      .select('article.id', 'id')
      .addSelect('COUNT(DISTINCT at.tag_id)', 'matched')
      .where('at.tag_id IN (:...tagIds)', { tagIds })
      .andWhere('article.datePublished IS NOT NULL')
      .andWhere('article.datePublished <= :now', { now: new Date() })
      .groupBy('article.id')
      .orderBy('matched', 'DESC')
      .addOrderBy('article.priority', 'DESC')
      .addOrderBy('article.datePublished', 'DESC')
      .limit(limit);

    if (excludeId) {
      qb.andWhere('article.id != :excludeId', { excludeId });
    }

    const rows = await qb.getRawMany<{ id: number; matched: string }>();
    rows.forEach((row) =>
      assertRawRowShape(row, { id: 'number' }, 'findSimilarRankedIds'),
    );
    return rows.map((row) => row.id);
  }

  // Похожие статьи (шаг 2) — main-info по уже ранжированным id, порядок из шага 1 сохраняется.
  async findMainInfoByIds(ids: number[]): Promise<Article[]> {
    if (!ids.length) return [];

    const items = await this.repo
      .createQueryBuilder('article')
      .leftJoin('article.authors', 'author')
      .leftJoin('article.tags', 'tag')
      .leftJoin('article.cover', 'cover')
      .select(ARTICLE_MAIN_FIELDS)
      .addSelect(AUTHOR_SHORT_FIELDS)
      .addSelect(TAG_SHORT_FIELDS)
      .addSelect(MEDIA_COVER_SHORT_FIELDS)
      .where('article.id IN (:...ids)', { ids })
      .getMany();

    const order = new Map(ids.map((id, index) => [id, index]));
    return items.sort(
      (a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0),
    );
  }

  // Для дашборда — см. countPublicationStats().
  countStats(): Promise<PublicationStats> {
    return countPublicationStats(this.repo, 'datePublished');
  }

  // Полный список для reindex — только поля, нужные для поискового документа, без relations
  // (авторов/тегов/faq), чтобы не плодить JOIN-дубликаты строк на сотнях статей разом.
  findAllForSearchIndex(): Promise<
    Pick<Article, 'id' | 'slug' | 'title' | 'description' | 'datePublished'>[]
  > {
    return this.repo.find({
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        datePublished: true,
      },
    });
  }

  create(data: {
    slug: string;
    title: string;
    description?: string;
    content: Record<string, unknown>;
    contentHtml?: string;
    metaTitle?: string;
    metaDescription?: string;
    keywords?: string;
    datePublished: Date | null;
    priority: number;
    readingTime: number | null;
    hasToc: boolean;
    cover: Article['cover'];
    authors: Article['authors'];
    tags: Article['tags'];
  }): Article {
    return this.repo.create(data);
  }

  save(article: Article): Promise<Article> {
    return this.repo.save(article);
  }

  async remove(id: number): Promise<void> {
    await this.repo.delete(id);
  }
}

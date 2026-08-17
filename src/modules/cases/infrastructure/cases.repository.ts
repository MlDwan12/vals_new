import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository, SelectQueryBuilder } from 'typeorm';
import {
  countPublicationStats,
  PublicationStats,
} from '../../../core/persistence/count-publication-stats.util';
import { escapeLikePattern } from '../../../core/persistence/escape-like-pattern.util';
import {
  applyAuthorSlugFilter,
  applyTagSlugFilter,
  AUTHOR_SHORT_FIELDS,
  TAG_SHORT_FIELDS,
} from '../../../core/persistence/author-tag-relation-filters.util';
import { SortByDate } from '../../../core/enums/sort-by-date.enum';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../../core/pagination/paginated-result.interface';
import { Case } from '../domain/case.entity';
import { CaseListQueryDto } from '../dto/case-list-query.dto';
import { CaseSitemapItemDto } from '../dto/case-sitemap-item.dto';

export const CASE_MAIN_FIELDS = [
  'cases.id',
  'cases.slug',
  'cases.title',
  'cases.description',
  'cases.problem',
  'cases.result',
  'cases.industry',
  'cases.datePublished',
  'cases.priority',
  'cases.createdAt',
  'cases.updatedAt',
];

const SORT_COLUMN: Record<
  SortByDate,
  { column: string; direction: 'ASC' | 'DESC' }
> = {
  [SortByDate.UPDATED_DESC]: { column: 'cases.updatedAt', direction: 'DESC' },
  [SortByDate.UPDATED_ASC]: { column: 'cases.updatedAt', direction: 'ASC' },
  [SortByDate.CREATED_DESC]: { column: 'cases.createdAt', direction: 'DESC' },
  [SortByDate.CREATED_ASC]: { column: 'cases.createdAt', direction: 'ASC' },
  [SortByDate.PUBLISHED_DESC]: {
    column: 'cases.datePublished',
    direction: 'DESC',
  },
  [SortByDate.PUBLISHED_ASC]: {
    column: 'cases.datePublished',
    direction: 'ASC',
  },
};

const AUTHOR_JOIN = {
  entityAlias: 'cases',
  joinTable: 'case_authors',
  entityIdColumn: 'case_id',
};

const TAG_JOIN = {
  entityAlias: 'cases',
  joinTable: 'case_tags',
  entityIdColumn: 'case_id',
};

@Injectable()
export class CasesRepository {
  constructor(
    @InjectRepository(Case) private readonly repo: Repository<Case>,
  ) {}

  private mainInfoQuery(query: CaseListQueryDto): SelectQueryBuilder<Case> {
    const qb = this.repo
      .createQueryBuilder('cases')
      .leftJoin('cases.authors', 'author')
      .leftJoin('cases.tags', 'tag')
      .select(CASE_MAIN_FIELDS)
      .addSelect(AUTHOR_SHORT_FIELDS)
      .addSelect(TAG_SHORT_FIELDS)
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    if (query.search) {
      qb.andWhere('cases.title ILIKE :search', {
        search: `%${escapeLikePattern(query.search)}%`,
      });
    }
    applyAuthorSlugFilter(qb, AUTHOR_JOIN, query.authorSlug);
    applyTagSlugFilter(qb, TAG_JOIN, query.tagSlug);

    return qb;
  }

  async findMainInfoList(
    query: CaseListQueryDto,
  ): Promise<PaginatedResult<Case>> {
    const sort = SORT_COLUMN[query.sortBy ?? SortByDate.CREATED_DESC];
    const qb = this.mainInfoQuery(query).orderBy(sort.column, sort.direction);

    const [items, total] = await qb.getManyAndCount();
    return buildPaginatedResult(items, total, query.page, query.limit);
  }

  // Публичный список сайта — только опубликованные (datePublished <= now).
  async findPublishedMainInfoList(
    query: CaseListQueryDto,
  ): Promise<PaginatedResult<Case>> {
    const sort = SORT_COLUMN[query.sortBy ?? SortByDate.PUBLISHED_DESC];
    const qb = this.mainInfoQuery(query)
      .andWhere('cases.datePublished IS NOT NULL')
      .andWhere('cases.datePublished <= :now', { now: new Date() })
      .orderBy('cases.priority', 'DESC')
      .addOrderBy(sort.column, sort.direction)
      .addOrderBy('cases.id', 'DESC');

    const [items, total] = await qb.getManyAndCount();
    return buildPaginatedResult(items, total, query.page, query.limit);
  }

  // Все опубликованные кейсы без пагинации — sitemap.xml и человекочитаемая карта сайта.
  findAllPublishedSitemapItems(): Promise<CaseSitemapItemDto[]> {
    return this.repo
      .createQueryBuilder('cases')
      .select('cases.slug', 'slug')
      .addSelect('cases.title', 'title')
      .addSelect('cases.updatedAt', 'updatedAt')
      .where('cases.datePublished IS NOT NULL')
      .andWhere('cases.datePublished <= :now', { now: new Date() })
      .orderBy('cases.datePublished', 'DESC')
      .getRawMany<CaseSitemapItemDto>();
  }

  findBySlug(slug: string): Promise<Case | null> {
    return this.repo.findOne({
      where: { slug },
      relations: { services: true, authors: true, tags: true, faq: true },
      order: { faq: { id: 'ASC' } },
    });
  }

  findBySlugPublished(slug: string): Promise<Case | null> {
    return this.repo.findOne({
      where: { slug, datePublished: LessThanOrEqual(new Date()) },
      relations: { services: true, authors: true, tags: true, faq: true },
      order: { faq: { id: 'ASC' } },
    });
  }

  findById(id: number): Promise<Case | null> {
    return this.repo.findOne({
      where: { id },
      relations: { services: true, authors: true, tags: true, faq: true },
      order: { faq: { id: 'ASC' } },
    });
  }

  // Для FAQ-сервиса (CaseFaqService.resolveCase) — см. ArticlesRepository.findPublicationMetaById.
  findPublicationMetaById(
    id: number,
  ): Promise<Pick<Case, 'id' | 'slug' | 'datePublished'> | null> {
    return this.repo.findOne({
      where: { id },
      select: { id: true, slug: true, datePublished: true },
    });
  }

  // Опубликованные кейсы по услуге — публичная страница услуги, блок «Кейсы».
  findPublishedByServiceId(serviceId: number): Promise<Case[]> {
    return findPublishedCasesByServiceId(this.repo, serviceId);
  }

  // Похожие кейсы (шаг 1) — id опубликованных кейсов, ранжированные по числу совпавших тегов.
  async findSimilarRankedIds(
    tagIds: number[],
    excludeId: number | undefined,
    limit: number,
  ): Promise<number[]> {
    const qb = this.repo
      .createQueryBuilder('cases')
      .innerJoin('case_tags', 'ct', 'ct.case_id = cases.id')
      .select('cases.id', 'id')
      .addSelect('COUNT(DISTINCT ct.tag_id)', 'matched')
      .where('ct.tag_id IN (:...tagIds)', { tagIds })
      .andWhere('cases.datePublished IS NOT NULL')
      .andWhere('cases.datePublished <= :now', { now: new Date() })
      .groupBy('cases.id')
      .orderBy('matched', 'DESC')
      .addOrderBy('cases.priority', 'DESC')
      .addOrderBy('cases.datePublished', 'DESC')
      .limit(limit);

    if (excludeId) {
      qb.andWhere('cases.id != :excludeId', { excludeId });
    }

    const rows = await qb.getRawMany<{ id: number; matched: string }>();
    return rows.map((row) => row.id);
  }

  // Похожие кейсы (шаг 2) — main-info по уже ранжированным id, порядок из шага 1 сохраняется.
  async findMainInfoByIds(ids: number[]): Promise<Case[]> {
    if (!ids.length) return [];

    const items = await this.repo
      .createQueryBuilder('cases')
      .leftJoin('cases.authors', 'author')
      .leftJoin('cases.tags', 'tag')
      .select(CASE_MAIN_FIELDS)
      .addSelect(AUTHOR_SHORT_FIELDS)
      .addSelect(TAG_SHORT_FIELDS)
      .where('cases.id IN (:...ids)', { ids })
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

  // Полный список для reindex — только поля, нужные для поискового документа, без relations.
  findAllForSearchIndex(): Promise<
    Pick<Case, 'id' | 'slug' | 'title' | 'description' | 'datePublished'>[]
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
    problem: string;
    result: string;
    industry: string[];
    content?: Record<string, unknown>;
    contentHtml?: string;
    metaTitle?: string;
    metaDescription?: string;
    keywords?: string;
    datePublished: Date | null;
    priority: number;
    hasToc: boolean;
    services: Case['services'];
    authors: Case['authors'];
    tags: Case['tags'];
  }): Case {
    return this.repo.create(data);
  }

  save(caseEntity: Case): Promise<Case> {
    return this.repo.save(caseEntity);
  }

  async remove(id: number): Promise<void> {
    await this.repo.delete(id);
  }
}

// Обычная функция (не метод CasesRepository) — переиспользуется в ServicesRepository для embed'а
// кейсов в /services/info/:slug, не создавая циклической зависимости модулей (CasesModule уже
// импортирует ServicesModule).
export function findPublishedCasesByServiceId(
  repo: Repository<Case>,
  serviceId: number,
): Promise<Case[]> {
  return repo
    .createQueryBuilder('cases')
    .innerJoin('cases.services', 'service')
    .leftJoin('cases.authors', 'author')
    .leftJoin('cases.tags', 'tag')
    .select(CASE_MAIN_FIELDS)
    .addSelect(AUTHOR_SHORT_FIELDS)
    .addSelect(TAG_SHORT_FIELDS)
    .where('service.id = :serviceId', { serviceId })
    .andWhere('cases.datePublished IS NOT NULL')
    .andWhere('cases.datePublished <= :now', { now: new Date() })
    .orderBy('cases.priority', 'DESC')
    .addOrderBy('cases.datePublished', 'DESC')
    .addOrderBy('cases.id', 'DESC')
    .getMany();
}

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { assertRawRowShape } from '../../../core/persistence/assert-raw-row-shape.util';
import { escapeLikePattern } from '../../../core/persistence/escape-like-pattern.util';
import { MEDIA_COVER_SHORT_FIELDS } from '../../../core/persistence/media-cover-fields.util';
import { SortByDate } from '../../../core/enums/sort-by-date.enum';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../../core/pagination/paginated-result.interface';
import { Landing } from '../domain/landing.entity';
import { LandingListQueryDto } from '../dto/landing-list-query.dto';
import { LandingSitemapItemDto } from '../dto/landing-sitemap-item.dto';

const SERVICE_SHORT_FIELDS = ['service.id', 'service.slug', 'service.title'];
const INDUSTRY_FIELDS = ['industry.id', 'industry.slug', 'industry.name'];

const LANDING_MAIN_FIELDS = [
  'landing.id',
  'landing.slug',
  'landing.title',
  'landing.subtitle',
  'landing.isPublished',
  'landing.priority',
  'landing.createdAt',
  'landing.updatedAt',
];

const SORT_COLUMN: Record<
  SortByDate,
  { column: string; direction: 'ASC' | 'DESC' }
> = {
  [SortByDate.UPDATED_DESC]: {
    column: 'landing.updatedAt',
    direction: 'DESC',
  },
  [SortByDate.UPDATED_ASC]: { column: 'landing.updatedAt', direction: 'ASC' },
  [SortByDate.CREATED_DESC]: {
    column: 'landing.createdAt',
    direction: 'DESC',
  },
  [SortByDate.CREATED_ASC]: { column: 'landing.createdAt', direction: 'ASC' },
  // У лендинга нет datePublished (гейт — булев isPublished) — публикационная сортировка не имеет
  // отдельной колонки, откатываемся на createdAt (тот же практический смысл: "недавние").
  [SortByDate.PUBLISHED_DESC]: {
    column: 'landing.createdAt',
    direction: 'DESC',
  },
  [SortByDate.PUBLISHED_ASC]: {
    column: 'landing.createdAt',
    direction: 'ASC',
  },
};

interface LandingSearchIndexRow {
  id: number;
  slug: string;
  serviceSlug: string;
  title: string;
  subtitle: string | null;
  isPublished: boolean;
}

@Injectable()
export class LandingsRepository {
  constructor(
    @InjectRepository(Landing) private readonly repo: Repository<Landing>,
  ) {}

  private mainInfoQuery(
    query: LandingListQueryDto,
  ): SelectQueryBuilder<Landing> {
    const qb = this.repo
      .createQueryBuilder('landing')
      .innerJoin('landing.service', 'service')
      .innerJoin('landing.industry', 'industry')
      .leftJoin('landing.cover', 'cover')
      .select(LANDING_MAIN_FIELDS)
      .addSelect(SERVICE_SHORT_FIELDS)
      .addSelect(INDUSTRY_FIELDS)
      .addSelect(MEDIA_COVER_SHORT_FIELDS)
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    if (query.search) {
      qb.andWhere('landing.title ILIKE :search', {
        search: `%${escapeLikePattern(query.search)}%`,
      });
    }
    if (query.serviceId) {
      qb.andWhere('service.id = :serviceId', { serviceId: query.serviceId });
    }
    if (query.industryId) {
      qb.andWhere('industry.id = :industryId', {
        industryId: query.industryId,
      });
    }

    return qb;
  }

  async findMainInfoList(
    query: LandingListQueryDto,
  ): Promise<PaginatedResult<Landing>> {
    const sort = SORT_COLUMN[query.sortBy ?? SortByDate.CREATED_DESC];
    const qb = this.mainInfoQuery(query).orderBy(sort.column, sort.direction);

    const [items, total] = await qb.getManyAndCount();
    return buildPaginatedResult(items, total, query.page, query.limit);
  }

  async findBySlugPublished(
    serviceSlug: string,
    slug: string,
  ): Promise<Landing | null> {
    const landing = await this.repo.findOne({
      where: {
        slug,
        isPublished: true,
        service: { slug: serviceSlug },
      },
      relations: {
        service: true,
        industry: true,
        cover: true,
        cases: true,
        faq: true,
      },
      order: { faq: { id: 'ASC' } },
    });
    if (!landing) return null;

    // Security review: у Case свой независимый гейт публикации (datePublished), не связанный с
    // landing.isPublished. Без фильтра здесь черновой/отложенный кейс, привязанный к странице
    // через caseIds, утекал бы в публичный ответ раньше своего срока публикации — тот же принцип,
    // что уже применён для embed'а кейсов в /services/info/:slug
    // (CasesRepository.findPublishedCasesByServiceId).
    const now = new Date();
    landing.cases = landing.cases.filter(
      (item) => item.datePublished !== null && item.datePublished <= now,
    );
    return landing;
  }

  findById(id: number): Promise<Landing | null> {
    return this.repo.findOne({
      where: { id },
      relations: {
        service: true,
        industry: true,
        cover: true,
        cases: true,
        faq: true,
      },
      order: { faq: { id: 'ASC' } },
    });
  }

  // Для LandingFaqService.resolveLanding — проверка существования родителя + slug/serviceSlug/
  // isPublished для построения поискового документа, без тяжёлого findById.
  async findPublicationMetaById(id: number): Promise<{
    id: number;
    slug: string;
    serviceSlug: string;
    isPublished: boolean;
  } | null> {
    const row = await this.repo
      .createQueryBuilder('landing')
      .innerJoin('landing.service', 'service')
      .select('landing.id', 'id')
      .addSelect('landing.slug', 'slug')
      .addSelect('service.slug', 'serviceSlug')
      .addSelect('landing.isPublished', 'isPublished')
      .where('landing.id = :id', { id })
      .getRawOne<{
        id: number;
        slug: string;
        serviceSlug: string;
        isPublished: boolean;
      }>();

    if (!row) return null;
    assertRawRowShape(
      row,
      { id: 'number', slug: 'string', serviceSlug: 'string' },
      'findPublicationMetaById',
    );
    return row;
  }

  // Все опубликованные страницы без пагинации — sitemap.xml и человекочитаемая карта сайта.
  async findAllPublishedSitemapItems(): Promise<LandingSitemapItemDto[]> {
    const rows = await this.repo
      .createQueryBuilder('landing')
      .innerJoin('landing.service', 'service')
      .select('landing.slug', 'slug')
      .addSelect('service.slug', 'serviceSlug')
      .addSelect('landing.title', 'title')
      .addSelect('landing.updatedAt', 'updatedAt')
      .where('landing.isPublished = true')
      .orderBy('landing.priority', 'DESC')
      .addOrderBy('landing.updatedAt', 'DESC')
      .getRawMany<LandingSitemapItemDto>();

    rows.forEach((row) =>
      assertRawRowShape(
        row,
        { slug: 'string', serviceSlug: 'string', title: 'string' },
        'findAllPublishedSitemapItems',
      ),
    );
    return rows;
  }

  // Полный список для reindex — только поля, нужные для поискового документа.
  async findAllForSearchIndex(): Promise<LandingSearchIndexRow[]> {
    const rows = await this.repo
      .createQueryBuilder('landing')
      .innerJoin('landing.service', 'service')
      .select('landing.id', 'id')
      .addSelect('landing.slug', 'slug')
      .addSelect('service.slug', 'serviceSlug')
      .addSelect('landing.title', 'title')
      .addSelect('landing.subtitle', 'subtitle')
      .addSelect('landing.isPublished', 'isPublished')
      .getRawMany<LandingSearchIndexRow>();

    rows.forEach((row) =>
      assertRawRowShape(
        row,
        {
          id: 'number',
          slug: 'string',
          serviceSlug: 'string',
          title: 'string',
        },
        'findAllForSearchIndex',
      ),
    );
    return rows;
  }

  create(data: {
    slug: string;
    title: string;
    h1: string;
    subtitle?: string;
    content: Record<string, unknown>;
    contentHtml?: string;
    metaTitle?: string;
    metaDescription?: string;
    keywords?: string;
    advantages?: string[];
    ctaTitle?: string;
    ctaSubtitle?: string;
    ctaButtonText?: string;
    isPublished: boolean;
    priority: number;
    service: Landing['service'];
    industry: Landing['industry'];
    cover: Landing['cover'];
    cases: Landing['cases'];
  }): Landing {
    return this.repo.create(data);
  }

  save(landing: Landing): Promise<Landing> {
    return this.repo.save(landing);
  }

  async remove(id: number): Promise<void> {
    await this.repo.delete(id);
  }
}

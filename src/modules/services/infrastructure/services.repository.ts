import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Case } from '../../cases/domain/case.entity';
import { findPublishedCasesByServiceId } from '../../cases/infrastructure/cases.repository';
import { SortByDate } from '../../../core/enums/sort-by-date.enum';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../../core/pagination/paginated-result.interface';
import { escapeLikePattern } from '../../../core/persistence/escape-like-pattern.util';
import { Service } from '../domain/service.entity';
import { ServiceListQueryDto } from '../dto/service-list-query.dto';

const SORT_COLUMN: Record<
  SortByDate,
  { column: string; direction: 'ASC' | 'DESC' }
> = {
  [SortByDate.UPDATED_DESC]: {
    column: 'service.updatedAt',
    direction: 'DESC',
  },
  [SortByDate.UPDATED_ASC]: { column: 'service.updatedAt', direction: 'ASC' },
  [SortByDate.CREATED_DESC]: {
    column: 'service.createdAt',
    direction: 'DESC',
  },
  [SortByDate.CREATED_ASC]: { column: 'service.createdAt', direction: 'ASC' },
  // У услуг нет даты публикации — как и в старом коде, PUBLISHED_* сортирует по createdAt.
  [SortByDate.PUBLISHED_DESC]: {
    column: 'service.createdAt',
    direction: 'DESC',
  },
  [SortByDate.PUBLISHED_ASC]: {
    column: 'service.createdAt',
    direction: 'ASC',
  },
};

const FULL_RELATIONS = {
  category: true,
  steps: true,
  tariffs: true,
  faq: true,
} as const;

const FULL_ORDER = {
  id: 'ASC' as const,
  steps: { step: 'ASC' as const },
};

@Injectable()
export class ServicesRepository {
  constructor(
    @InjectRepository(Service) private readonly repo: Repository<Service>,
    @InjectRepository(Case) private readonly caseRepo: Repository<Case>,
  ) {}

  count(): Promise<number> {
    return this.repo.count();
  }

  findByIds(ids: number[]): Promise<Service[]> {
    if (!ids.length) return Promise.resolve([]);
    return this.repo.find({
      where: { id: In(ids) },
      select: { id: true, slug: true, title: true },
    });
  }

  findBySlug(slug: string): Promise<Service | null> {
    return this.repo.findOne({
      where: { slug },
      select: { id: true, slug: true, title: true },
    });
  }

  async findMainInfoList(
    query: ServiceListQueryDto,
  ): Promise<PaginatedResult<Service>> {
    const sort = SORT_COLUMN[query.sortBy ?? SortByDate.CREATED_DESC];
    const qb = this.repo
      .createQueryBuilder('service')
      .select([
        'service.id',
        'service.slug',
        'service.title',
        'service.createdAt',
        'service.updatedAt',
      ])
      .orderBy(sort.column, sort.direction)
      .skip((query.page - 1) * query.limit)
      .take(query.limit);

    if (query.search) {
      qb.andWhere('service.title ILIKE :search', {
        search: `%${escapeLikePattern(query.search)}%`,
      });
    }

    const [items, total] = await qb.getManyAndCount();
    return buildPaginatedResult(items, total, query.page, query.limit);
  }

  findShortInfoList(): Promise<Service[]> {
    return this.repo.find({
      relations: { category: true },
      order: { id: 'ASC' },
    });
  }

  findFullInfoList(): Promise<Service[]> {
    return this.repo.find({
      relations: FULL_RELATIONS,
      order: FULL_ORDER,
    });
  }

  findListWithFaq(): Promise<Service[]> {
    return this.repo.find({
      relations: { category: true, faq: true },
      order: { id: 'ASC' },
    });
  }

  findBySlugWithRelations(slug: string): Promise<Service | null> {
    return this.repo.findOne({
      where: { slug },
      relations: FULL_RELATIONS,
      order: FULL_ORDER,
    });
  }

  findById(id: number): Promise<Service | null> {
    return this.repo.findOne({
      where: { id },
      relations: FULL_RELATIONS,
      order: FULL_ORDER,
    });
  }

  // Опубликованные кейсы услуги — для embed в /services/info/:slug. Общая функция с
  // CasesRepository.findPublishedByServiceId (не импортируем CasesModule, чтобы не создавать
  // циклическую зависимость модулей: CasesModule уже импортирует ServicesModule).
  findPublishedCasesForService(serviceId: number): Promise<Case[]> {
    return findPublishedCasesByServiceId(this.caseRepo, serviceId);
  }

  // Полный список для reindex — только поля, нужные для поискового документа, без relations.
  findAllForSearchIndex(): Promise<
    Pick<Service, 'id' | 'slug' | 'title' | 'subtitle' | 'description'>[]
  > {
    return this.repo.find({
      select: {
        id: true,
        slug: true,
        title: true,
        subtitle: true,
        description: true,
      },
    });
  }

  create(data: {
    slug: string;
    category: Service['category'];
    title: string;
    subtitle?: string;
    description: string;
    subDescription: string;
    list?: string[];
    icon: string;
    backgroundColor?: Service['backgroundColor'];
  }): Service {
    return this.repo.create(data);
  }

  save(service: Service): Promise<Service> {
    return this.repo.save(service);
  }

  async remove(id: number): Promise<void> {
    await this.repo.delete(id);
  }
}

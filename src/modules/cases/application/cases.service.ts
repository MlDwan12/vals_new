import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EmployeesRepository } from '../../employees/infrastructure/employees.repository';
import { PaginatedResult } from '../../../core/pagination/paginated-result.interface';
import { applyDefinedFields } from '../../../core/persistence/apply-defined-fields.util';
import { isUniqueViolation } from '../../../core/persistence/postgres-error.util';
import {
  resolveOptionalEntitiesByIds,
  resolveOptionalEntityById,
  resolveRequiredEntitiesByIds,
} from '../../../core/persistence/resolve-entities-by-ids.util';
import { MediaRepository } from '../../media/infrastructure/media.repository';
import { SearchIndexService } from '../../search/application/search-index.service';
import { ServicesRepository } from '../../services/infrastructure/services.repository';
import { TagsRepository } from '../../tags/infrastructure/tags.repository';
import { CaseFaqService } from './case-faq.service';
import {
  buildCaseFaqSearchDocuments,
  buildCaseSearchDocument,
  caseFaqDocumentIds,
  isCasePublished,
} from './case-search-document.util';
import { Case } from '../domain/case.entity';
import { CaseListQueryDto } from '../dto/case-list-query.dto';
import { CaseMainInfoDto } from '../dto/case-main-info.dto';
import { CaseResponseDto } from '../dto/case-response.dto';
import { CaseSitemapItemDto } from '../dto/case-sitemap-item.dto';
import { CreateCaseDto } from '../dto/create-case.dto';
import { UpdateCaseDto } from '../dto/update-case.dto';
import { CasesRepository } from '../infrastructure/cases.repository';

@Injectable()
export class CasesService {
  constructor(
    private readonly casesRepository: CasesRepository,
    private readonly servicesRepository: ServicesRepository,
    private readonly employeesRepository: EmployeesRepository,
    private readonly mediaRepository: MediaRepository,
    private readonly tagsRepository: TagsRepository,
    private readonly searchIndexService: SearchIndexService,
    private readonly caseFaqService: CaseFaqService,
  ) {}

  async create(dto: CreateCaseDto): Promise<CaseResponseDto> {
    const [services, authors, tags, cover] = await Promise.all([
      resolveRequiredEntitiesByIds(
        dto.serviceIds,
        (ids) => this.servicesRepository.findByIds(ids),
        'Услуги',
        'serviceIds',
      ),
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

    const caseEntity = this.casesRepository.create({
      slug: dto.slug,
      title: dto.title,
      description: dto.description,
      problem: dto.problem,
      result: dto.result,
      industry: dto.industry,
      content: dto.content,
      contentHtml: dto.contentHtml,
      metaTitle: dto.metaTitle,
      metaDescription: dto.metaDescription,
      keywords: dto.keywords,
      datePublished: dto.datePublished ? new Date(dto.datePublished) : null,
      priority: dto.priority ?? 0,
      hasToc: dto.hasToc ?? false,
      cover,
      services,
      authors,
      tags,
    });

    try {
      const saved = await this.casesRepository.save(caseEntity);
      const entity = await this.findEntityByIdOrFail(saved.id);
      await this.indexCase(entity);
      return CaseResponseDto.fromEntity(entity);
    } catch (error) {
      throw this.mapSlugConflict(error);
    }
  }

  async update(id: number, dto: UpdateCaseDto): Promise<CaseResponseDto> {
    const caseEntity = await this.findEntityByIdOrFail(id);

    if (dto.serviceIds !== undefined) {
      caseEntity.services = await resolveRequiredEntitiesByIds(
        dto.serviceIds,
        (ids) => this.servicesRepository.findByIds(ids),
        'Услуги',
        'serviceIds',
      );
    }
    if (dto.authorIds !== undefined) {
      caseEntity.authors = await resolveRequiredEntitiesByIds(
        dto.authorIds,
        (ids) => this.employeesRepository.findByIds(ids),
        'Сотрудники',
        'authorIds',
      );
    }
    if (dto.tagIds !== undefined) {
      caseEntity.tags = await resolveOptionalEntitiesByIds(
        dto.tagIds,
        (ids) => this.tagsRepository.findByIds(ids),
        'Теги',
      );
    }
    if (dto.coverMediaId !== undefined) {
      // Присваиваем саму relation-сущность, не FK-скаляр — см. ArticlesService.update, тот же
      // приём и та же причина (уже загруженная caseEntity.cover иначе переопределяет FK при save()).
      caseEntity.cover = await this.resolveCover(dto.coverMediaId);
    }
    // datePublished — отдельно от общего хелпера ниже: значение нужно конвертировать в Date,
    // а простое присутствие ключа в DTO (в т.ч. null) уже отличает "не трогать" от "обнулить".
    if ('datePublished' in dto) {
      caseEntity.datePublished = dto.datePublished
        ? new Date(dto.datePublished)
        : null;
    }

    applyDefinedFields(caseEntity, {
      slug: dto.slug,
      title: dto.title,
      description: dto.description,
      problem: dto.problem,
      result: dto.result,
      industry: dto.industry,
      content: dto.content,
      contentHtml: dto.contentHtml,
      metaTitle: dto.metaTitle,
      metaDescription: dto.metaDescription,
      keywords: dto.keywords,
      priority: dto.priority,
      hasToc: dto.hasToc,
    });

    try {
      const saved = await this.casesRepository.save(caseEntity);
      const entity = await this.findEntityByIdOrFail(saved.id);
      await this.indexCase(entity);
      return CaseResponseDto.fromEntity(entity);
    } catch (error) {
      throw this.mapSlugConflict(error);
    }
  }

  async remove(id: number): Promise<void> {
    const caseEntity = await this.findEntityByIdOrFail(id);
    await this.casesRepository.remove(id);
    await this.searchIndexService.deleteDocuments([
      `case_${id}`,
      ...caseFaqDocumentIds(caseEntity),
    ]);
  }

  // Полная переиндексация (admin + периодический тик) — кейсы + их FAQ одним вызовом. Дополнительно
  // чистит stale-документы — upsert сам по себе их не находит (M7 code review).
  async reindexSearch(): Promise<void> {
    const now = new Date();
    const [cases, faqDocs] = await Promise.all([
      this.casesRepository.findAllForSearchIndex(),
      this.caseFaqService.buildAllSearchDocuments(now),
    ]);
    const publishedDocs = cases
      .filter(
        (caseEntity) =>
          caseEntity.datePublished !== null && caseEntity.datePublished <= now,
      )
      .map((caseEntity) => buildCaseSearchDocument(caseEntity));

    await this.searchIndexService.upsertDocuments([
      ...publishedDocs,
      ...faqDocs,
    ]);
    await this.searchIndexService.reconcileStaleDocuments(
      'case',
      'caseFaq_',
      new Set([
        ...publishedDocs.map((doc) => doc.id),
        ...faqDocs.map((doc) => doc.id),
      ]),
    );
  }

  async findById(id: number): Promise<CaseResponseDto> {
    return CaseResponseDto.fromEntity(await this.findEntityByIdOrFail(id));
  }

  async findBySlug(slug: string): Promise<CaseResponseDto> {
    const caseEntity = await this.casesRepository.findBySlug(slug);
    if (!caseEntity) {
      throw new NotFoundException(`Кейс со slug "${slug}" не найден`);
    }
    return CaseResponseDto.fromEntity(caseEntity);
  }

  async findBySlugPublished(slug: string): Promise<CaseResponseDto> {
    const caseEntity = await this.casesRepository.findBySlugPublished(slug);
    if (!caseEntity) {
      throw new NotFoundException(`Кейс со slug "${slug}" не найден`);
    }
    return CaseResponseDto.fromEntity(caseEntity);
  }

  async findList(
    query: CaseListQueryDto,
  ): Promise<PaginatedResult<CaseMainInfoDto>> {
    const result = await this.casesRepository.findMainInfoList(query);
    return {
      ...result,
      items: result.items.map((caseEntity) =>
        CaseMainInfoDto.fromEntity(caseEntity),
      ),
    };
  }

  // Публичный список сайта — только опубликованные (datePublished <= now).
  async findPublishedList(
    query: CaseListQueryDto,
  ): Promise<PaginatedResult<CaseMainInfoDto>> {
    const result = await this.casesRepository.findPublishedMainInfoList(query);
    return {
      ...result,
      items: result.items.map((caseEntity) =>
        CaseMainInfoDto.fromEntity(caseEntity),
      ),
    };
  }

  findAllPublishedSitemapItems(): Promise<CaseSitemapItemDto[]> {
    return this.casesRepository.findAllPublishedSitemapItems();
  }

  // Публичная страница услуги — опубликованные кейсы, привязанные к этой услуге по slug.
  async findPublishedByServiceSlug(slug: string): Promise<CaseMainInfoDto[]> {
    const service = await this.servicesRepository.findBySlug(slug);
    if (!service) {
      throw new NotFoundException(`Услуга со slug "${slug}" не найдена`);
    }
    const cases = await this.casesRepository.findPublishedByServiceId(
      service.id,
    );
    return cases.map((caseEntity) => CaseMainInfoDto.fromEntity(caseEntity));
  }

  async findSimilarPublished(
    tagIds: number[],
    excludeId: number | undefined,
    limit: number,
  ): Promise<CaseMainInfoDto[]> {
    if (!tagIds.length) return [];

    const ids = await this.casesRepository.findSimilarRankedIds(
      tagIds,
      excludeId,
      limit,
    );
    const cases = await this.casesRepository.findMainInfoByIds(ids);
    return cases.map((caseEntity) => CaseMainInfoDto.fromEntity(caseEntity));
  }

  private async findEntityByIdOrFail(id: number): Promise<Case> {
    const caseEntity = await this.casesRepository.findById(id);
    if (!caseEntity) {
      throw new NotFoundException(`Кейс с ID ${id} не найден`);
    }
    return caseEntity;
  }

  private mapSlugConflict(error: unknown): unknown {
    if (isUniqueViolation(error)) {
      return new ConflictException('Кейс с таким slug уже существует');
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

  // FAQ кейса синхронизируется тем же вызовом, что и сам документ — иначе unpublish/публикация/
  // смена slug кейса рассинхронизирует FAQ с его состоянием в индексе (H6).
  private async indexCase(caseEntity: Case): Promise<void> {
    if (isCasePublished(caseEntity)) {
      await this.searchIndexService.upsertDocuments([
        buildCaseSearchDocument(caseEntity),
        ...buildCaseFaqSearchDocuments(caseEntity),
      ]);
    } else {
      await this.searchIndexService.deleteDocuments([
        `case_${caseEntity.id}`,
        ...caseFaqDocumentIds(caseEntity),
      ]);
    }
  }
}

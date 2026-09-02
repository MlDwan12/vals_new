import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { applyDefinedFields } from '../../../core/persistence/apply-defined-fields.util';
import {
  isForeignKeyViolation,
  isUniqueViolation,
} from '../../../core/persistence/postgres-error.util';
import { PaginatedResult } from '../../../core/pagination/paginated-result.interface';
import { SearchIndexService } from '../../search/application/search-index.service';
import { ServiceFaqService } from './service-faq.service';
import {
  buildServiceSearchDocument,
  serviceFaqDocumentIds,
} from './service-search-document.util';
import { ServiceCategory } from '../domain/service-category.entity';
import { Service } from '../domain/service.entity';
import { CreateServiceDto } from '../dto/create-service.dto';
import { ServiceFullInfoDto } from '../dto/service-full-info.dto';
import { ServiceInfoDto } from '../dto/service-info.dto';
import { ServiceListFaqDto } from '../dto/service-list-faq.dto';
import { ServiceListQueryDto } from '../dto/service-list-query.dto';
import { ServiceMainInfoDto } from '../dto/service-main-info.dto';
import { ServiceShortInfoDto } from '../dto/service-short-info.dto';
import { UpdateServiceDto } from '../dto/update-service.dto';
import { ServiceCategoriesRepository } from '../infrastructure/service-categories.repository';
import { ServicesRepository } from '../infrastructure/services.repository';

@Injectable()
export class ServicesService {
  constructor(
    private readonly servicesRepository: ServicesRepository,
    private readonly serviceCategoriesRepository: ServiceCategoriesRepository,
    private readonly searchIndexService: SearchIndexService,
    private readonly serviceFaqService: ServiceFaqService,
  ) {}

  async create(dto: CreateServiceDto): Promise<ServiceFullInfoDto> {
    const category = await this.resolveCategory(dto.categoryId);

    const service = this.servicesRepository.create({
      slug: dto.slug,
      category,
      title: dto.title,
      subtitle: dto.subtitle,
      description: dto.description,
      subDescription: dto.subDescription,
      list: dto.list,
      icon: dto.icon,
      backgroundColor: dto.backgroundColor,
      metaTitle: dto.metaTitle,
      metaDescription: dto.metaDescription,
      keywords: dto.keywords,
      h1: dto.h1,
    });

    try {
      const saved = await this.servicesRepository.save(service);
      const entity = await this.findEntityByIdOrFail(saved.id);
      await this.searchIndexService.upsertDocuments([
        buildServiceSearchDocument(entity),
      ]);
      return ServiceFullInfoDto.fromEntity(entity);
    } catch (error) {
      throw this.mapSlugConflict(error);
    }
  }

  async update(id: number, dto: UpdateServiceDto): Promise<ServiceFullInfoDto> {
    const service = await this.findEntityByIdOrFail(id);

    if (dto.categoryId !== undefined) {
      service.category = await this.resolveCategory(dto.categoryId);
    }

    applyDefinedFields(service, {
      slug: dto.slug,
      title: dto.title,
      subtitle: dto.subtitle,
      description: dto.description,
      subDescription: dto.subDescription,
      list: dto.list,
      icon: dto.icon,
      backgroundColor: dto.backgroundColor,
      metaTitle: dto.metaTitle,
      metaDescription: dto.metaDescription,
      keywords: dto.keywords,
      h1: dto.h1,
    });

    try {
      const saved = await this.servicesRepository.save(service);
      const entity = await this.findEntityByIdOrFail(saved.id);
      await this.searchIndexService.upsertDocuments([
        buildServiceSearchDocument(entity),
      ]);
      return ServiceFullInfoDto.fromEntity(entity);
    } catch (error) {
      throw this.mapSlugConflict(error);
    }
  }

  async remove(id: number): Promise<void> {
    // Независимые запросы (существование услуги + списки ссылающихся landing/кейсов) — параллельно.
    const [service, referencingLandings, referencingCases] = await Promise.all([
      this.findEntityByIdOrFail(id),
      // RESTRICT на landings.service_id (§10.1 expansion-decisions.md) — понятное сообщение со
      // списком страниц вместо голой ошибки FK, по образцу предупреждения при удалении обложки
      // (EXPANSION_TASKS.md §4.2).
      this.servicesRepository.findReferencingLandings(id),
      // RESTRICT на service_to_case.service_id (security-audit-2026-08-31.md №4) — раньше эта
      // связь была CASCADE и молча обнуляла Case.services в обход ArrayMinSize(1) на DTO.
      this.servicesRepository.findReferencingCases(id),
    ]);
    if (referencingLandings.length) {
      throw this.notDeletableConflict(
        referencingLandings,
        'в нишевых страницах',
      );
    }
    if (referencingCases.length) {
      throw this.notDeletableConflict(referencingCases, 'в кейсах');
    }

    try {
      await this.servicesRepository.remove(id);
    } catch (error) {
      // Гонка: страница/кейс могли привязаться к услуге между пречеком выше и этим DELETE (TOCTOU,
      // code review) — RESTRICT на landings.service_id/service_to_case.service_id тогда бьёт по
      // самому DELETE. Ловим тем же приёмом, что isForeignKeyViolation у tags/employees, вместо
      // голого 500 из QueryFailedError.
      if (isForeignKeyViolation(error)) {
        const [landings, cases] = await Promise.all([
          this.servicesRepository.findReferencingLandings(id),
          this.servicesRepository.findReferencingCases(id),
        ]);
        if (landings.length) {
          throw this.notDeletableConflict(landings, 'в нишевых страницах');
        }
        if (cases.length) {
          throw this.notDeletableConflict(cases, 'в кейсах');
        }
      }
      throw error;
    }
    await this.searchIndexService.deleteDocuments([
      `service_${id}`,
      ...serviceFaqDocumentIds(service),
    ]);
  }

  // Общий шаблон для findReferencingLandings/findReferencingCases (/simplify simplification
  // finding — landingConflict/caseConflict были на 90% одним и тем же ConflictException).
  private notDeletableConflict(
    items: { title: string }[],
    usedInPhrase: string,
  ): ConflictException {
    return new ConflictException(
      `Услугу нельзя удалить — она используется ${usedInPhrase}: ${items
        .map((item) => item.title)
        .join(', ')}`,
    );
  }

  // Полная переиндексация (admin + периодический тик) — услуги + их FAQ одним вызовом.
  // Дополнительно чистит stale-документы — upsert сам по себе их не находит (M7 code review).
  async reindexSearch(): Promise<void> {
    const [services, faqDocs] = await Promise.all([
      this.servicesRepository.findAllForSearchIndex(),
      this.serviceFaqService.buildAllSearchDocuments(),
    ]);
    const serviceDocs = services.map((service) =>
      buildServiceSearchDocument(service),
    );

    await this.searchIndexService.upsertDocuments([...serviceDocs, ...faqDocs]);
    await this.searchIndexService.reconcileStaleDocuments(
      'service',
      'serviceFaq_',
      new Set([
        ...serviceDocs.map((doc) => doc.id),
        ...faqDocs.map((doc) => doc.id),
      ]),
    );
  }

  async findById(id: number): Promise<ServiceFullInfoDto> {
    return ServiceFullInfoDto.fromEntity(await this.findEntityByIdOrFail(id));
  }

  async findBySlugInfo(slug: string): Promise<ServiceInfoDto> {
    const service = await this.servicesRepository.findBySlugWithRelations(slug);
    if (!service) {
      throw new NotFoundException(`Услуга со slug "${slug}" не найдена`);
    }
    const cases = await this.servicesRepository.findPublishedCasesForService(
      service.id,
    );
    return ServiceInfoDto.fromEntity(service, cases);
  }

  async findMainInfoList(
    query: ServiceListQueryDto,
  ): Promise<PaginatedResult<ServiceMainInfoDto>> {
    const result = await this.servicesRepository.findMainInfoList(query);
    return {
      ...result,
      items: result.items.map((service) =>
        ServiceMainInfoDto.fromEntity(service),
      ),
    };
  }

  async findShortInfoList(): Promise<ServiceShortInfoDto[]> {
    const services = await this.servicesRepository.findShortInfoList();
    return services.map((service) => ServiceShortInfoDto.fromEntity(service));
  }

  // Используется и для GET /services/all/info, и для GET /services/all/full-info — в старом
  // коде это два разных механизма (relations vs ручной QueryBuilder.select) с одинаковым
  // результирующим составом полей, здесь один репозиторный метод на оба роута.
  async findFullInfoList(): Promise<ServiceFullInfoDto[]> {
    const services = await this.servicesRepository.findFullInfoList();
    return services.map((service) => ServiceFullInfoDto.fromEntity(service));
  }

  async findListWithFaq(): Promise<ServiceListFaqDto[]> {
    const services = await this.servicesRepository.findListWithFaq();
    return services.map((service) => ServiceListFaqDto.fromEntity(service));
  }

  private async findEntityByIdOrFail(id: number): Promise<Service> {
    const service = await this.servicesRepository.findById(id);
    if (!service) {
      throw new NotFoundException(`Услуга с ID ${id} не найдена`);
    }
    return service;
  }

  private async resolveCategory(categoryId: number): Promise<ServiceCategory> {
    const category =
      await this.serviceCategoriesRepository.findById(categoryId);
    if (!category) {
      throw new BadRequestException(`Категория с ID ${categoryId} не найдена`);
    }
    return category;
  }

  private mapSlugConflict(error: unknown): unknown {
    if (isUniqueViolation(error)) {
      return new ConflictException('Услуга с таким slug уже существует');
    }
    return error;
  }
}

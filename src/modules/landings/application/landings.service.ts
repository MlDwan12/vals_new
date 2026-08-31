import {
  BadRequestException,
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
} from '../../../core/persistence/resolve-entities-by-ids.util';
import { CasesRepository } from '../../cases/infrastructure/cases.repository';
import { IndustriesRepository } from '../../industries/infrastructure/industries.repository';
import { Industry } from '../../industries/domain/industry.entity';
import { MediaRepository } from '../../media/infrastructure/media.repository';
import { SearchIndexService } from '../../search/application/search-index.service';
import { Service } from '../../services/domain/service.entity';
import { ServicesRepository } from '../../services/infrastructure/services.repository';
import { LandingFaqService } from './landing-faq.service';
import { buildLandingSearchDocument } from './landing-search-document.util';
import { Landing } from '../domain/landing.entity';
import { CreateLandingDto } from '../dto/create-landing.dto';
import { LandingListQueryDto } from '../dto/landing-list-query.dto';
import { LandingMainInfoDto } from '../dto/landing-main-info.dto';
import { LandingResponseDto } from '../dto/landing-response.dto';
import { LandingSitemapItemDto } from '../dto/landing-sitemap-item.dto';
import { UpdateLandingDto } from '../dto/update-landing.dto';
import { LandingsRepository } from '../infrastructure/landings.repository';

@Injectable()
export class LandingsService {
  constructor(
    private readonly landingsRepository: LandingsRepository,
    private readonly servicesRepository: ServicesRepository,
    private readonly industriesRepository: IndustriesRepository,
    private readonly casesRepository: CasesRepository,
    private readonly mediaRepository: MediaRepository,
    private readonly searchIndexService: SearchIndexService,
    private readonly landingFaqService: LandingFaqService,
  ) {}

  async create(dto: CreateLandingDto): Promise<LandingResponseDto> {
    const [service, industry, cases, cover] = await Promise.all([
      this.resolveService(dto.serviceId),
      this.resolveIndustry(dto.industryId),
      resolveOptionalEntitiesByIds(
        dto.caseIds,
        (ids) => this.casesRepository.findByIds(ids),
        'Кейсы',
      ),
      this.resolveCover(dto.coverMediaId),
    ]);

    const landing = this.landingsRepository.create({
      slug: dto.slug,
      title: dto.title,
      h1: dto.h1,
      subtitle: dto.subtitle,
      content: dto.content,
      contentHtml: dto.contentHtml,
      metaTitle: dto.metaTitle,
      metaDescription: dto.metaDescription,
      keywords: dto.keywords,
      advantages: dto.advantages,
      ctaTitle: dto.ctaTitle,
      ctaSubtitle: dto.ctaSubtitle,
      ctaButtonText: dto.ctaButtonText,
      isPublished: dto.isPublished ?? false,
      priority: dto.priority ?? 0,
      service,
      industry,
      cover,
      cases,
    });

    try {
      const saved = await this.landingsRepository.save(landing);
      // service/industry/cover/cases уже присвоены полными сущностями выше — save() возвращает тот
      // же объект с ними как есть, полный релоад не нужен. faq — единственное, чего create() не
      // инициализирует (OneToMany), у новой страницы он всегда пуст.
      saved.faq = [];
      await this.indexLanding(saved);
      return LandingResponseDto.fromEntity(saved);
    } catch (error) {
      throw this.mapSlugConflict(error);
    }
  }

  async update(id: number, dto: UpdateLandingDto): Promise<LandingResponseDto> {
    const landing = await this.findEntityByIdOrFail(id);

    if (dto.serviceId !== undefined) {
      landing.service = await this.resolveService(dto.serviceId);
    }
    if (dto.industryId !== undefined) {
      landing.industry = await this.resolveIndustry(dto.industryId);
    }
    if (dto.caseIds !== undefined) {
      landing.cases = await resolveOptionalEntitiesByIds(
        dto.caseIds,
        (ids) => this.casesRepository.findByIds(ids),
        'Кейсы',
      );
    }
    if (dto.coverMediaId !== undefined) {
      // Присваиваем саму relation-сущность, не FK-скаляр — см. ArticlesService.update, тот же
      // приём и причина (уже загруженный landing.cover иначе переопределяет FK при save()).
      landing.cover = await this.resolveCover(dto.coverMediaId);
    }

    applyDefinedFields(landing, {
      slug: dto.slug,
      title: dto.title,
      h1: dto.h1,
      subtitle: dto.subtitle,
      content: dto.content,
      contentHtml: dto.contentHtml,
      metaTitle: dto.metaTitle,
      metaDescription: dto.metaDescription,
      keywords: dto.keywords,
      advantages: dto.advantages,
      ctaTitle: dto.ctaTitle,
      ctaSubtitle: dto.ctaSubtitle,
      ctaButtonText: dto.ctaButtonText,
      isPublished: dto.isPublished,
      priority: dto.priority,
    });

    try {
      // landing уже загружен со всеми relations в findEntityByIdOrFail(id) выше и корректно
      // домутирован (service/industry/cases/cover переприсвоены только если пришли в dto,
      // остальное — из исходной полной загрузки) — save() возвращает тот же объект, повторный
      // релоад избыточен.
      const saved = await this.landingsRepository.save(landing);
      await this.indexLanding(saved);
      return LandingResponseDto.fromEntity(saved);
    } catch (error) {
      throw this.mapSlugConflict(error);
    }
  }

  async remove(id: number): Promise<void> {
    const landing = await this.findEntityByIdOrFail(id);
    await this.landingsRepository.remove(id);
    // CASCADE в БД удаляет landing_faq вместе со страницей — документы FAQ из индекса поиска сами
    // не исчезают, чистим их здесь же по уже загруженной relations.faq (findEntityByIdOrFail).
    await this.searchIndexService.deleteDocuments([
      `landing_${id}`,
      ...landing.faq.map((faq) => `landingFaq_${faq.id}`),
    ]);
  }

  // Полная переиндексация (admin + периодический тик) — страницы + их FAQ одним вызовом.
  async reindexSearch(): Promise<void> {
    const [landings, faqDocs] = await Promise.all([
      this.landingsRepository.findAllForSearchIndex(),
      this.landingFaqService.buildAllSearchDocuments(),
    ]);
    const publishedDocs = landings
      .filter((landing) => landing.isPublished)
      .map((landing) => buildLandingSearchDocument(landing));

    await this.searchIndexService.upsertDocuments([
      ...publishedDocs,
      ...faqDocs,
    ]);
    await this.searchIndexService.reconcileStaleDocuments(
      'landing',
      'landingFaq_',
      new Set([
        ...publishedDocs.map((doc) => doc.id),
        ...faqDocs.map((doc) => doc.id),
      ]),
    );
  }

  async findById(id: number): Promise<LandingResponseDto> {
    return LandingResponseDto.fromEntity(await this.findEntityByIdOrFail(id));
  }

  async findBySlugPublished(
    serviceSlug: string,
    slug: string,
  ): Promise<LandingResponseDto> {
    const landing = await this.landingsRepository.findBySlugPublished(
      serviceSlug,
      slug,
    );
    if (!landing) {
      throw new NotFoundException(
        `Нишевая страница "${serviceSlug}/${slug}" не найдена`,
      );
    }
    return LandingResponseDto.fromEntity(landing);
  }

  async findList(
    query: LandingListQueryDto,
  ): Promise<PaginatedResult<LandingMainInfoDto>> {
    const result = await this.landingsRepository.findMainInfoList(query);
    return {
      ...result,
      items: result.items.map((landing) =>
        LandingMainInfoDto.fromEntity(landing),
      ),
    };
  }

  findAllPublishedSitemapItems(): Promise<LandingSitemapItemDto[]> {
    return this.landingsRepository.findAllPublishedSitemapItems();
  }

  private async findEntityByIdOrFail(id: number): Promise<Landing> {
    const landing = await this.landingsRepository.findById(id);
    if (!landing) {
      throw new NotFoundException(`Нишевая страница с ID ${id} не найдена`);
    }
    return landing;
  }

  private async resolveService(serviceId: number): Promise<Service> {
    // findByIds — лёгкая проекция (id/slug/title), всё что нужно ServiceShortDto в ответе.
    // findById() тянет FULL_RELATIONS (category/steps/tariffs/faq) — избыточно для этой связи.
    const [service] = await this.servicesRepository.findByIds([serviceId]);
    if (!service) {
      throw new BadRequestException(`Услуга с ID ${serviceId} не найдена`);
    }
    return service;
  }

  private async resolveIndustry(industryId: number): Promise<Industry> {
    const industry = await this.industriesRepository.findById(industryId);
    if (!industry) {
      throw new BadRequestException(`Отрасль с ID ${industryId} не найдена`);
    }
    return industry;
  }

  private resolveCover(coverMediaId: number | null | undefined) {
    return resolveOptionalEntityById(
      coverMediaId,
      (id) => this.mediaRepository.findById(id),
      'Обложка',
    );
  }

  private mapSlugConflict(error: unknown): unknown {
    if (isUniqueViolation(error)) {
      return new ConflictException(
        'Нишевая страница с таким slug уже существует для этой услуги',
      );
    }
    return error;
  }

  // Черновик не должен утекать в публичный поиск — тот же принцип, что у статей/кейсов/новостей.
  private async indexLanding(landing: Landing): Promise<void> {
    if (landing.isPublished) {
      await this.searchIndexService.upsertDocuments([
        buildLandingSearchDocument({
          id: landing.id,
          slug: landing.slug,
          serviceSlug: landing.service.slug,
          title: landing.title,
          subtitle: landing.subtitle,
        }),
      ]);
    } else {
      await this.searchIndexService.deleteDocuments([`landing_${landing.id}`]);
    }
  }
}

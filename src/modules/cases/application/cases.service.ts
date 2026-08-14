import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Employee } from '../../employees/domain/employee.entity';
import { EmployeesRepository } from '../../employees/infrastructure/employees.repository';
import { PaginatedResult } from '../../../core/pagination/paginated-result.interface';
import { applyDefinedFields } from '../../../core/persistence/apply-defined-fields.util';
import { isUniqueViolation } from '../../../core/persistence/postgres-error.util';
import { Service } from '../../services/domain/service.entity';
import { ServicesRepository } from '../../services/infrastructure/services.repository';
import { Tag } from '../../tags/domain/tag.entity';
import { TagsRepository } from '../../tags/infrastructure/tags.repository';
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
    private readonly tagsRepository: TagsRepository,
  ) {}

  async create(dto: CreateCaseDto): Promise<CaseResponseDto> {
    const [services, authors, tags] = await Promise.all([
      this.resolveServices(dto.serviceIds),
      this.resolveAuthors(dto.authorIds),
      this.resolveTags(dto.tagIds),
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
      services,
      authors,
      tags,
    });

    try {
      const saved = await this.casesRepository.save(caseEntity);
      return CaseResponseDto.fromEntity(
        await this.findEntityByIdOrFail(saved.id),
      );
    } catch (error) {
      throw this.mapSlugConflict(error);
    }
  }

  async update(id: number, dto: UpdateCaseDto): Promise<CaseResponseDto> {
    const caseEntity = await this.findEntityByIdOrFail(id);

    if (dto.serviceIds !== undefined) {
      caseEntity.services = await this.resolveServices(dto.serviceIds);
    }
    if (dto.authorIds !== undefined) {
      caseEntity.authors = await this.resolveAuthors(dto.authorIds);
    }
    if (dto.tagIds !== undefined) {
      caseEntity.tags = await this.resolveTags(dto.tagIds);
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
      return CaseResponseDto.fromEntity(
        await this.findEntityByIdOrFail(saved.id),
      );
    } catch (error) {
      throw this.mapSlugConflict(error);
    }
  }

  async remove(id: number): Promise<void> {
    await this.findEntityByIdOrFail(id);
    await this.casesRepository.remove(id);
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

  private async resolveServices(serviceIds: number[]): Promise<Service[]> {
    const uniqueIds = Array.from(new Set(serviceIds));
    if (uniqueIds.length === 0) {
      throw new BadRequestException('serviceIds не должен быть пустым');
    }

    const services = await this.servicesRepository.findByIds(uniqueIds);
    this.assertAllFound(
      'Услуги',
      uniqueIds,
      services.map((service) => service.id),
    );
    return services;
  }

  private async resolveAuthors(authorIds: number[]): Promise<Employee[]> {
    const uniqueIds = Array.from(new Set(authorIds));
    if (uniqueIds.length === 0) {
      throw new BadRequestException('authorIds не должен быть пустым');
    }

    const authors = await this.employeesRepository.findByIds(uniqueIds);
    this.assertAllFound(
      'Сотрудники',
      uniqueIds,
      authors.map((author) => author.id),
    );
    return authors;
  }

  private async resolveTags(tagIds?: number[]): Promise<Tag[]> {
    const uniqueIds = Array.from(new Set(tagIds ?? []));
    if (uniqueIds.length === 0) return [];

    const tags = await this.tagsRepository.findByIds(uniqueIds);
    this.assertAllFound(
      'Теги',
      uniqueIds,
      tags.map((tag) => tag.id),
    );
    return tags;
  }

  private assertAllFound(
    label: string,
    requested: number[],
    found: number[],
  ): void {
    if (found.length === requested.length) return;

    const foundSet = new Set(found);
    const missing = requested.filter((id) => !foundSet.has(id));
    throw new BadRequestException(`${label} не найдены: ${missing.join(', ')}`);
  }

  private mapSlugConflict(error: unknown): unknown {
    if (isUniqueViolation(error)) {
      return new ConflictException('Кейс с таким slug уже существует');
    }
    return error;
  }
}

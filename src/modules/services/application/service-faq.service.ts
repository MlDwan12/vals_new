import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../../core/pagination/paginated-result.interface';
import { GlobalSearchDocument } from '../../search/application/global-search-document.interface';
import { SearchIndexService } from '../../search/application/search-index.service';
import { buildFaqSearchDocument } from '../../search/application/faq-search-document.util';
import { ServicesRepository } from '../infrastructure/services.repository';
import { ServiceFaq } from '../domain/service-faq.entity';
import { CreateServiceFaqDto } from '../dto/create-service-faq.dto';
import { ServiceFaqResponseDto } from '../dto/service-faq-response.dto';
import { UpdateServiceFaqDto } from '../dto/update-service-faq.dto';
import { ServiceFaqRepository } from '../infrastructure/service-faq.repository';

@Injectable()
export class ServiceFaqService {
  constructor(
    private readonly serviceFaqRepository: ServiceFaqRepository,
    private readonly servicesRepository: ServicesRepository,
    private readonly searchIndexService: SearchIndexService,
  ) {}

  async create(dto: CreateServiceFaqDto): Promise<ServiceFaqResponseDto> {
    const service = await this.resolveService(dto.serviceId);
    const faq = await this.serviceFaqRepository.create(dto);
    await this.indexFaq(faq, service.slug);
    return ServiceFaqResponseDto.fromEntity(faq);
  }

  async update(
    id: number,
    dto: UpdateServiceFaqDto,
  ): Promise<ServiceFaqResponseDto> {
    const existing = await this.findEntityByIdOrFail(id);
    const service = await this.resolveService(
      dto.serviceId ?? existing.serviceId,
    );

    const updated = await this.serviceFaqRepository.update(id, dto);
    if (!updated) {
      throw new NotFoundException(`FAQ с ID ${id} не найдено`);
    }
    await this.indexFaq(updated, service.slug);
    return ServiceFaqResponseDto.fromEntity(updated);
  }

  async remove(id: number): Promise<void> {
    await this.findEntityByIdOrFail(id);
    await this.serviceFaqRepository.remove(id);
    await this.searchIndexService.deleteDocuments([`serviceFaq_${id}`]);
  }

  // Часть переиндексации услуг (ServicesService.reindexSearch()), не отдельный admin-эндпоинт.
  async buildAllSearchDocuments(): Promise<GlobalSearchDocument[]> {
    const rows = await this.serviceFaqRepository.findAllForSearchIndex();
    return rows.map((row) =>
      buildFaqSearchDocument({
        idPrefix: 'serviceFaq',
        id: row.id,
        question: row.question,
        answer: row.answer,
        parentUrl: `/services/${row.serviceSlug}`,
      }),
    );
  }

  async findById(id: number): Promise<ServiceFaqResponseDto> {
    return ServiceFaqResponseDto.fromEntity(
      await this.findEntityByIdOrFail(id),
    );
  }

  async paginate(
    page: number,
    limit: number,
  ): Promise<PaginatedResult<ServiceFaqResponseDto>> {
    const [items, total] = await this.serviceFaqRepository.findAndCount(
      page,
      limit,
    );
    return buildPaginatedResult(
      items.map((item) => ServiceFaqResponseDto.fromEntity(item)),
      total,
      page,
      limit,
    );
  }

  private async findEntityByIdOrFail(id: number): Promise<ServiceFaq> {
    const faq = await this.serviceFaqRepository.findById(id);
    if (!faq) {
      throw new NotFoundException(`FAQ с ID ${id} не найдено`);
    }
    return faq;
  }

  private async resolveService(
    serviceId: number,
  ): Promise<{ id: number; slug: string; title: string }> {
    const [service] = await this.servicesRepository.findByIds([serviceId]);
    if (!service) {
      throw new BadRequestException(`Услуга с ID ${serviceId} не найдена`);
    }
    return service;
  }

  // Услуга всегда опубликована — гейта по датам нет, только upsert.
  private async indexFaq(faq: ServiceFaq, serviceSlug: string): Promise<void> {
    const doc = buildFaqSearchDocument({
      idPrefix: 'serviceFaq',
      id: faq.id,
      question: faq.question,
      answer: faq.answer,
      parentUrl: `/services/${serviceSlug}`,
    });
    await this.searchIndexService.upsertDocuments([doc]);
  }
}

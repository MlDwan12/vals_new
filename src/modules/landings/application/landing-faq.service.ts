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
import { LandingFaq } from '../domain/landing-faq.entity';
import { CreateLandingFaqDto } from '../dto/create-landing-faq.dto';
import { LandingFaqResponseDto } from '../dto/landing-faq-response.dto';
import { UpdateLandingFaqDto } from '../dto/update-landing-faq.dto';
import { LandingFaqRepository } from '../infrastructure/landing-faq.repository';
import { LandingsRepository } from '../infrastructure/landings.repository';
import { buildLandingUrl } from './landing-search-document.util';

type LandingMeta = {
  id: number;
  slug: string;
  serviceSlug: string;
  isPublished: boolean;
};

@Injectable()
export class LandingFaqService {
  constructor(
    private readonly landingFaqRepository: LandingFaqRepository,
    private readonly landingsRepository: LandingsRepository,
    private readonly searchIndexService: SearchIndexService,
  ) {}

  async create(dto: CreateLandingFaqDto): Promise<LandingFaqResponseDto> {
    const landing = await this.resolveLanding(dto.landingId);
    const faq = await this.landingFaqRepository.create(dto);
    await this.indexFaq(faq, landing);
    return LandingFaqResponseDto.fromEntity(faq);
  }

  async update(
    id: number,
    dto: UpdateLandingFaqDto,
  ): Promise<LandingFaqResponseDto> {
    const existing = await this.findEntityByIdOrFail(id);
    const landing = await this.resolveLanding(
      dto.landingId ?? existing.landingId,
    );

    const updated = await this.landingFaqRepository.update(id, dto);
    if (!updated) {
      throw new NotFoundException(`FAQ с ID ${id} не найдено`);
    }
    await this.indexFaq(updated, landing);
    return LandingFaqResponseDto.fromEntity(updated);
  }

  async remove(id: number): Promise<void> {
    await this.findEntityByIdOrFail(id);
    await this.landingFaqRepository.remove(id);
    await this.searchIndexService.deleteDocuments([`landingFaq_${id}`]);
  }

  // Полный список документов для reindex — вызывается из LandingsService.reindexSearch(), не
  // отдельным admin-эндпоинтом (та же схема, что у article/case FAQ).
  async buildAllSearchDocuments(): Promise<GlobalSearchDocument[]> {
    const rows = await this.landingFaqRepository.findAllForSearchIndex();
    return rows
      .filter((row) => row.landingIsPublished)
      .map((row) =>
        buildFaqSearchDocument({
          idPrefix: 'landingFaq',
          id: row.id,
          question: row.question,
          answer: row.answer,
          parentUrl: buildLandingUrl(row.serviceSlug, row.landingSlug),
        }),
      );
  }

  async findById(id: number): Promise<LandingFaqResponseDto> {
    return LandingFaqResponseDto.fromEntity(
      await this.findEntityByIdOrFail(id),
    );
  }

  async paginate(
    page: number,
    limit: number,
  ): Promise<PaginatedResult<LandingFaqResponseDto>> {
    const [items, total] = await this.landingFaqRepository.findAndCount(
      page,
      limit,
    );
    return buildPaginatedResult(
      items.map((item) => LandingFaqResponseDto.fromEntity(item)),
      total,
      page,
      limit,
    );
  }

  private async findEntityByIdOrFail(id: number): Promise<LandingFaq> {
    const faq = await this.landingFaqRepository.findById(id);
    if (!faq) {
      throw new NotFoundException(`FAQ с ID ${id} не найдено`);
    }
    return faq;
  }

  private async resolveLanding(landingId: number): Promise<LandingMeta> {
    const landing =
      await this.landingsRepository.findPublicationMetaById(landingId);
    if (!landing) {
      throw new BadRequestException(
        `Нишевая страница с ID ${landingId} не найдена`,
      );
    }
    return landing;
  }

  // Черновик — FAQ не должен утекать в публичный поиск раньше самой страницы.
  private async indexFaq(faq: LandingFaq, landing: LandingMeta): Promise<void> {
    const doc = buildFaqSearchDocument({
      idPrefix: 'landingFaq',
      id: faq.id,
      question: faq.question,
      answer: faq.answer,
      parentUrl: buildLandingUrl(landing.serviceSlug, landing.slug),
    });

    if (landing.isPublished) {
      await this.searchIndexService.upsertDocuments([doc]);
    } else {
      await this.searchIndexService.deleteDocuments([doc.id]);
    }
  }
}

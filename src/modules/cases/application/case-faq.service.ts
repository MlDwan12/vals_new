import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../../core/pagination/paginated-result.interface';
import { isForeignKeyViolation } from '../../../core/persistence/postgres-error.util';
import { GlobalSearchDocument } from '../../search/application/global-search-document.interface';
import { SearchIndexService } from '../../search/application/search-index.service';
import { buildFaqSearchDocument } from '../../search/application/faq-search-document.util';
import { CasesRepository } from '../infrastructure/cases.repository';
import { Case } from '../domain/case.entity';
import { CaseFaq } from '../domain/case-faq.entity';

type CaseMeta = Pick<Case, 'id' | 'slug' | 'datePublished'>;
import { CaseFaqResponseDto } from '../dto/case-faq-response.dto';
import { CreateCaseFaqDto } from '../dto/create-case-faq.dto';
import { UpdateCaseFaqDto } from '../dto/update-case-faq.dto';
import { CaseFaqRepository } from '../infrastructure/case-faq.repository';

@Injectable()
export class CaseFaqService {
  constructor(
    private readonly caseFaqRepository: CaseFaqRepository,
    private readonly casesRepository: CasesRepository,
    private readonly searchIndexService: SearchIndexService,
  ) {}

  async create(dto: CreateCaseFaqDto): Promise<CaseFaqResponseDto> {
    const caseEntity = await this.resolveCase(dto.caseId);
    try {
      const faq = await this.caseFaqRepository.create(dto);
      await this.indexFaq(faq, caseEntity);
      return CaseFaqResponseDto.fromEntity(faq);
    } catch (error) {
      throw this.mapConflict(error);
    }
  }

  async update(id: number, dto: UpdateCaseFaqDto): Promise<CaseFaqResponseDto> {
    const existing = await this.findEntityByIdOrFail(id);
    const caseEntity = await this.resolveCase(dto.caseId ?? existing.caseId);

    try {
      const updated = await this.caseFaqRepository.update(id, dto);
      if (!updated) {
        throw new NotFoundException(`FAQ с ID ${id} не найдено`);
      }
      await this.indexFaq(updated, caseEntity);
      return CaseFaqResponseDto.fromEntity(updated);
    } catch (error) {
      throw this.mapConflict(error);
    }
  }

  async remove(id: number): Promise<void> {
    await this.findEntityByIdOrFail(id);
    await this.caseFaqRepository.remove(id);
    await this.searchIndexService.deleteDocuments([`caseFaq_${id}`]);
  }

  // Часть переиндексации кейсов (CasesService.reindexSearch()), не отдельный admin-эндпоинт.
  async buildAllSearchDocuments(now: Date): Promise<GlobalSearchDocument[]> {
    const rows = await this.caseFaqRepository.findAllForSearchIndex();
    return rows
      .filter(
        (row) => row.caseDatePublished !== null && row.caseDatePublished <= now,
      )
      .map((row) =>
        buildFaqSearchDocument({
          idPrefix: 'caseFaq',
          id: row.id,
          question: row.question,
          answer: row.answer,
          parentUrl: `/cases/${row.caseSlug}`,
        }),
      );
  }

  async findById(id: number): Promise<CaseFaqResponseDto> {
    return CaseFaqResponseDto.fromEntity(await this.findEntityByIdOrFail(id));
  }

  async paginate(
    page: number,
    limit: number,
  ): Promise<PaginatedResult<CaseFaqResponseDto>> {
    const [items, total] = await this.caseFaqRepository.findAndCount(
      page,
      limit,
    );
    return buildPaginatedResult(
      items.map((item) => CaseFaqResponseDto.fromEntity(item)),
      total,
      page,
      limit,
    );
  }

  private async findEntityByIdOrFail(id: number): Promise<CaseFaq> {
    const faq = await this.caseFaqRepository.findById(id);
    if (!faq) {
      throw new NotFoundException(`FAQ с ID ${id} не найдено`);
    }
    return faq;
  }

  // TOCTOU: кейс мог быть удалён между resolveCase выше и этим create()/update() (case_faq.case_id
  // — CASCADE, security-audit-2026-08-31.md №11) — без перехвата голый QueryFailedError уходит
  // наружу как 500.
  private mapConflict(error: unknown): unknown {
    if (isForeignKeyViolation(error)) {
      return new BadRequestException(
        'Кейс, к которому привязывается FAQ, был удалён — повторите с актуальным caseId',
      );
    }
    return error;
  }

  private async resolveCase(caseId: number): Promise<CaseMeta> {
    const caseEntity =
      await this.casesRepository.findPublicationMetaById(caseId);
    if (!caseEntity) {
      throw new BadRequestException(`Кейс с ID ${caseId} не найден`);
    }
    return caseEntity;
  }

  private async indexFaq(faq: CaseFaq, caseEntity: CaseMeta): Promise<void> {
    const doc = buildFaqSearchDocument({
      idPrefix: 'caseFaq',
      id: faq.id,
      question: faq.question,
      answer: faq.answer,
      parentUrl: `/cases/${caseEntity.slug}`,
    });

    const isPublished =
      caseEntity.datePublished !== null &&
      caseEntity.datePublished <= new Date();

    if (isPublished) {
      await this.searchIndexService.upsertDocuments([doc]);
    } else {
      await this.searchIndexService.deleteDocuments([doc.id]);
    }
  }
}

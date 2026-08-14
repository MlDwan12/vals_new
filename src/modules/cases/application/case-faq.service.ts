import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../../core/pagination/paginated-result.interface';
import { CasesRepository } from '../infrastructure/cases.repository';
import { CaseFaq } from '../domain/case-faq.entity';
import { CaseFaqResponseDto } from '../dto/case-faq-response.dto';
import { CreateCaseFaqDto } from '../dto/create-case-faq.dto';
import { UpdateCaseFaqDto } from '../dto/update-case-faq.dto';
import { CaseFaqRepository } from '../infrastructure/case-faq.repository';

@Injectable()
export class CaseFaqService {
  constructor(
    private readonly caseFaqRepository: CaseFaqRepository,
    private readonly casesRepository: CasesRepository,
  ) {}

  async create(dto: CreateCaseFaqDto): Promise<CaseFaqResponseDto> {
    await this.assertCaseExists(dto.caseId);
    const faq = await this.caseFaqRepository.create(dto);
    return CaseFaqResponseDto.fromEntity(faq);
  }

  async update(id: number, dto: UpdateCaseFaqDto): Promise<CaseFaqResponseDto> {
    if (dto.caseId !== undefined) {
      await this.assertCaseExists(dto.caseId);
    }

    const updated = await this.caseFaqRepository.update(id, dto);
    if (!updated) {
      throw new NotFoundException(`FAQ с ID ${id} не найдено`);
    }
    return CaseFaqResponseDto.fromEntity(updated);
  }

  async remove(id: number): Promise<void> {
    await this.findEntityByIdOrFail(id);
    await this.caseFaqRepository.remove(id);
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

  private async assertCaseExists(caseId: number): Promise<void> {
    if (!(await this.casesRepository.existsById(caseId))) {
      throw new BadRequestException(`Кейс с ID ${caseId} не найден`);
    }
  }
}

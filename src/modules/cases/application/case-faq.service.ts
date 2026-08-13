import { Injectable, NotFoundException } from '@nestjs/common';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../../core/pagination/paginated-result.interface';
import { CaseFaq } from '../domain/case-faq.entity';
import { CaseFaqResponseDto } from '../dto/case-faq-response.dto';
import { CreateCaseFaqDto } from '../dto/create-case-faq.dto';
import { UpdateCaseFaqDto } from '../dto/update-case-faq.dto';
import { CaseFaqRepository } from '../infrastructure/case-faq.repository';

@Injectable()
export class CaseFaqService {
  constructor(private readonly caseFaqRepository: CaseFaqRepository) {}

  async create(dto: CreateCaseFaqDto): Promise<CaseFaqResponseDto> {
    const faq = await this.caseFaqRepository.create(dto);
    return CaseFaqResponseDto.fromEntity(faq);
  }

  async update(id: number, dto: UpdateCaseFaqDto): Promise<CaseFaqResponseDto> {
    await this.findEntityByIdOrFail(id);

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
}

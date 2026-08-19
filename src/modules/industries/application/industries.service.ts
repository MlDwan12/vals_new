import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../../core/pagination/paginated-result.interface';
import { isUniqueViolation } from '../../../core/persistence/postgres-error.util';
import { CreateIndustryDto } from '../dto/create-industry.dto';
import { Industry } from '../domain/industry.entity';
import { IndustryResponseDto } from '../dto/industry-response.dto';
import { UpdateIndustryDto } from '../dto/update-industry.dto';
import { IndustriesRepository } from '../infrastructure/industries.repository';

@Injectable()
export class IndustriesService {
  constructor(private readonly industriesRepository: IndustriesRepository) {}

  async create(dto: CreateIndustryDto): Promise<IndustryResponseDto> {
    try {
      const industry = await this.industriesRepository.create(dto);
      return IndustryResponseDto.fromEntity(industry);
    } catch (error) {
      throw this.mapUniqueConflict(error);
    }
  }

  async update(
    id: number,
    dto: UpdateIndustryDto,
  ): Promise<IndustryResponseDto> {
    try {
      const updated = await this.industriesRepository.update(id, dto);
      if (!updated) {
        throw new NotFoundException(`Отрасль с ID ${id} не найдена`);
      }
      return IndustryResponseDto.fromEntity(updated);
    } catch (error) {
      throw this.mapUniqueConflict(error);
    }
  }

  async remove(id: number): Promise<void> {
    await this.findEntityByIdOrFail(id);
    await this.industriesRepository.remove(id);
  }

  async findById(id: number): Promise<IndustryResponseDto> {
    return IndustryResponseDto.fromEntity(await this.findEntityByIdOrFail(id));
  }

  async paginate(
    page: number,
    limit: number,
  ): Promise<PaginatedResult<IndustryResponseDto>> {
    const [items, total] = await this.industriesRepository.findAndCount(
      page,
      limit,
    );
    return buildPaginatedResult(
      items.map((item) => IndustryResponseDto.fromEntity(item)),
      total,
      page,
      limit,
    );
  }

  async findPublishedList(): Promise<IndustryResponseDto[]> {
    const industries = await this.industriesRepository.findPublishedList();
    return industries.map((industry) =>
      IndustryResponseDto.fromEntity(industry),
    );
  }

  async findPublishedBySlugOrFail(slug: string): Promise<IndustryResponseDto> {
    const industry = await this.industriesRepository.findBySlugPublished(slug);
    if (!industry) {
      throw new NotFoundException(`Отрасль со slug "${slug}" не найдена`);
    }
    return IndustryResponseDto.fromEntity(industry);
  }

  private async findEntityByIdOrFail(id: number): Promise<Industry> {
    const industry = await this.industriesRepository.findById(id);
    if (!industry) {
      throw new NotFoundException(`Отрасль с ID ${id} не найдена`);
    }
    return industry;
  }

  private mapUniqueConflict(error: unknown): unknown {
    if (isUniqueViolation(error)) {
      return new ConflictException(
        'Отрасль с таким названием или slug уже существует',
      );
    }
    return error;
  }
}

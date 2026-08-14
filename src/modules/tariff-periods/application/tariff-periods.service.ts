import { Injectable, NotFoundException } from '@nestjs/common';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../../core/pagination/paginated-result.interface';
import { TariffPeriod } from '../domain/tariff-period.entity';
import { CreateTariffPeriodDto } from '../dto/create-tariff-period.dto';
import { TariffPeriodResponseDto } from '../dto/tariff-period-response.dto';
import { UpdateTariffPeriodDto } from '../dto/update-tariff-period.dto';
import { TariffPeriodsRepository } from '../infrastructure/tariff-periods.repository';

@Injectable()
export class TariffPeriodsService {
  constructor(
    private readonly tariffPeriodsRepository: TariffPeriodsRepository,
  ) {}

  async create(dto: CreateTariffPeriodDto): Promise<TariffPeriodResponseDto> {
    const period = await this.tariffPeriodsRepository.create(dto);
    return TariffPeriodResponseDto.fromEntity(period);
  }

  async update(
    id: number,
    dto: UpdateTariffPeriodDto,
  ): Promise<TariffPeriodResponseDto> {
    const updated = await this.tariffPeriodsRepository.update(id, dto);
    if (!updated) {
      throw new NotFoundException(`Период тарифа с ID ${id} не найден`);
    }
    return TariffPeriodResponseDto.fromEntity(updated);
  }

  async remove(id: number): Promise<void> {
    await this.findEntityByIdOrFail(id);
    await this.tariffPeriodsRepository.remove(id);
  }

  async findById(id: number): Promise<TariffPeriodResponseDto> {
    return TariffPeriodResponseDto.fromEntity(
      await this.findEntityByIdOrFail(id),
    );
  }

  async findAll(): Promise<TariffPeriodResponseDto[]> {
    const periods = await this.tariffPeriodsRepository.findAll();
    return periods.map((period) => TariffPeriodResponseDto.fromEntity(period));
  }

  async paginate(
    page: number,
    limit: number,
  ): Promise<PaginatedResult<TariffPeriodResponseDto>> {
    const [items, total] = await this.tariffPeriodsRepository.findAndCount(
      page,
      limit,
    );
    return buildPaginatedResult(
      items.map((item) => TariffPeriodResponseDto.fromEntity(item)),
      total,
      page,
      limit,
    );
  }

  private async findEntityByIdOrFail(id: number): Promise<TariffPeriod> {
    const period = await this.tariffPeriodsRepository.findById(id);
    if (!period) {
      throw new NotFoundException(`Период тарифа с ID ${id} не найден`);
    }
    return period;
  }
}

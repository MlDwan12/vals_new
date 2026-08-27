import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../../core/pagination/paginated-result.interface';
import { TariffsRepository } from '../../tariffs/infrastructure/tariffs.repository';
import { TariffPeriod } from '../domain/tariff-period.entity';
import { CreateTariffPeriodDto } from '../dto/create-tariff-period.dto';
import { TariffPeriodResponseDto } from '../dto/tariff-period-response.dto';
import { UpdateTariffPeriodDto } from '../dto/update-tariff-period.dto';
import { TariffPeriodsRepository } from '../infrastructure/tariff-periods.repository';

@Injectable()
export class TariffPeriodsService {
  constructor(
    private readonly tariffPeriodsRepository: TariffPeriodsRepository,
    private readonly tariffsRepository: TariffsRepository,
  ) {}

  async create(dto: CreateTariffPeriodDto): Promise<TariffPeriodResponseDto> {
    this.assertDiscountAllowed(dto.months, dto.discountPercent);
    const period = await this.tariffPeriodsRepository.create(dto);
    return TariffPeriodResponseDto.fromEntity(period);
  }

  async update(
    id: number,
    dto: UpdateTariffPeriodDto,
  ): Promise<TariffPeriodResponseDto> {
    const existing = await this.findEntityByIdOrFail(id);
    this.assertDiscountAllowed(
      dto.months ?? existing.months,
      dto.discountPercent !== undefined
        ? dto.discountPercent
        : existing.discountPercent,
    );

    const updated = await this.tariffPeriodsRepository.update(id, dto);
    if (!updated) {
      throw new NotFoundException(`Период тарифа с ID ${id} не найден`);
    }
    return TariffPeriodResponseDto.fromEntity(updated);
  }

  // months:1 — это и есть basePrice без скидки (TariffsService.buildBillingCycles применяет
  // discountPercent к pricePerMonth единообразно для всех периодов) — ненулевая скидка на таком
  // периоде дала бы внутренне противоречивый ответ API: discountPercent > 0, но pricePerMonth без
  // изменений (Б4, независимый аудит 2026-08-21).
  private assertDiscountAllowed(
    months: number,
    discountPercent: number | null | undefined,
  ): void {
    if (months === 1 && discountPercent) {
      throw new BadRequestException(
        'Скидка не применяется к периоду в 1 месяц',
      );
    }
  }

  // Без этой проверки удаление используемого периода не падает сразу (billing_cycles — jsonb-
  // снапшот, не FK на tariff_periods), а стреляет позже непонятной 400 "Периоды тарифа не найдены"
  // при первом же пересчёте billingCycles тарифа, который на него ссылался (Б5, независимый аудит
  // 2026-08-21).
  async remove(id: number): Promise<void> {
    await this.findEntityByIdOrFail(id);
    if (await this.tariffsRepository.existsByPeriodId(id)) {
      throw new BadRequestException(
        'Нельзя удалить период — он используется в тарифах. Сначала уберите период из тарифов.',
      );
    }
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

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { applyDefinedFields } from '../../../core/persistence/apply-defined-fields.util';
import {
  buildPaginatedResult,
  PaginatedResult,
} from '../../../core/pagination/paginated-result.interface';
import { TariffPeriodsRepository } from '../../tariff-periods/infrastructure/tariff-periods.repository';
import { Service } from '../../services/domain/service.entity';
import { ServicesRepository } from '../../services/infrastructure/services.repository';
import { Tariff } from '../domain/tariff.entity';
import { CreateTariffDto } from '../dto/create-tariff.dto';
import { TariffResponseDto } from '../dto/tariff-response.dto';
import { UpdateTariffDto } from '../dto/update-tariff.dto';
import { TariffsRepository } from '../infrastructure/tariffs.repository';

type BillingCycle = Tariff['billingCycles'][number];

@Injectable()
export class TariffsService {
  constructor(
    private readonly tariffsRepository: TariffsRepository,
    private readonly servicesRepository: ServicesRepository,
    private readonly tariffPeriodsRepository: TariffPeriodsRepository,
  ) {}

  async create(dto: CreateTariffDto): Promise<TariffResponseDto> {
    const [service, billingCycles] = await Promise.all([
      this.resolveService(dto.serviceId),
      this.buildBillingCycles(dto.periodIds, dto.basePrice),
    ]);

    const tariff = this.tariffsRepository.create({
      service,
      name: dto.name,
      from: dto.from,
      features: dto.features,
      isPopular: dto.isPopular ?? false,
      billingCycles,
      basePrice: dto.basePrice,
      orderIndex: dto.orderIndex ?? 0,
    });

    const saved = await this.tariffsRepository.save(tariff);
    return TariffResponseDto.fromEntity(saved);
  }

  async update(id: number, dto: UpdateTariffDto): Promise<TariffResponseDto> {
    const tariff = await this.findEntityByIdOrFail(id);

    if (dto.serviceId !== undefined) {
      tariff.service = await this.resolveService(dto.serviceId);
    }

    applyDefinedFields(tariff, {
      name: dto.name,
      from: dto.from,
      features: dto.features,
      isPopular: dto.isPopular,
      orderIndex: dto.orderIndex,
      basePrice: dto.basePrice,
    });

    if (dto.periodIds !== undefined || dto.basePrice !== undefined) {
      if (tariff.basePrice === null) {
        throw new BadRequestException(
          'Нельзя пересчитать периоды тарифа без basePrice',
        );
      }
      tariff.billingCycles = await this.buildBillingCycles(
        dto.periodIds,
        tariff.basePrice,
        tariff.billingCycles,
      );
    }

    const saved = await this.tariffsRepository.save(tariff);
    return TariffResponseDto.fromEntity(saved);
  }

  async remove(id: number): Promise<void> {
    await this.findEntityByIdOrFail(id);
    await this.tariffsRepository.remove(id);
  }

  async findById(id: number): Promise<TariffResponseDto> {
    return TariffResponseDto.fromEntity(await this.findEntityByIdOrFail(id));
  }

  async paginate(
    page: number,
    limit: number,
  ): Promise<PaginatedResult<TariffResponseDto>> {
    const [items, total] = await this.tariffsRepository.findAndCount(
      page,
      limit,
    );
    return buildPaginatedResult(
      items.map((item) => TariffResponseDto.fromEntity(item)),
      total,
      page,
      limit,
    );
  }

  private async resolveService(serviceId: number): Promise<Service> {
    const [service] = await this.servicesRepository.findByIds([serviceId]);
    if (!service) {
      throw new BadRequestException(`Услуга с ID ${serviceId} не найдена`);
    }
    return service;
  }

  // Без явных periodIds (создание) или при их отсутствии в patch (обновление, если ещё и
  // basePrice не менялся) — переиспользуем periodId, уже сохранённые в billingCycles тарифа.
  // Если и там пусто (новый тариф без периодов) — один синтетический цикл "1 месяц по basePrice".
  private async buildBillingCycles(
    periodIds: number[] | undefined,
    basePrice: number,
    existingCycles?: Tariff['billingCycles'],
  ): Promise<Tariff['billingCycles']> {
    const ids =
      periodIds ??
      existingCycles
        ?.map((cycle) => cycle.periodId)
        .filter((id): id is number => id !== null) ??
      [];

    if (ids.length === 0) {
      return [
        {
          periodId: null,
          monthCount: 1,
          pricePerMonth: basePrice,
          discountPercent: null,
          totalPrice: basePrice,
        },
      ];
    }

    const uniqueIds = Array.from(new Set(ids));
    const periods = await this.tariffPeriodsRepository.findByIds(uniqueIds);
    this.assertAllFound(
      'Периоды тарифа',
      uniqueIds,
      periods.map((period) => period.id),
    );

    return periods.map((period): BillingCycle => {
      const discountPercent = period.discountPercent ?? 0;
      const pricePerMonth =
        period.months === 1
          ? basePrice
          : basePrice * (1 - discountPercent / 100);

      return {
        periodId: period.id,
        monthCount: period.months,
        pricePerMonth,
        discountPercent: period.discountPercent,
        totalPrice: pricePerMonth * period.months,
      };
    });
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

  private async findEntityByIdOrFail(id: number): Promise<Tariff> {
    const tariff = await this.tariffsRepository.findById(id);
    if (!tariff) {
      throw new NotFoundException(`Тариф с ID ${id} не найден`);
    }
    return tariff;
  }
}

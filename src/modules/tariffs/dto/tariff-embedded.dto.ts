import { Tariff } from '../domain/tariff.entity';

// Минимальная проекция тарифа — embed в ответах об услуге. Полный CRUD тарифов — отдельный подэтап.
export class TariffEmbeddedDto {
  id: number;
  name: string;
  from: string;
  features: string;
  isPopular: boolean;
  billingCycles: Tariff['billingCycles'];
  basePrice: number | null;
  orderIndex: number;

  static fromEntity(tariff: Tariff): TariffEmbeddedDto {
    const dto = new TariffEmbeddedDto();
    dto.id = tariff.id;
    dto.name = tariff.name;
    dto.from = tariff.from;
    dto.features = tariff.features;
    dto.isPopular = tariff.isPopular;
    dto.billingCycles = tariff.billingCycles;
    dto.basePrice = tariff.basePrice;
    dto.orderIndex = tariff.orderIndex;
    return dto;
  }
}

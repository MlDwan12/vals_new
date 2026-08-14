import { Tariff } from '../domain/tariff.entity';

export class TariffResponseDto {
  id: number;
  serviceId: number | null;
  name: string;
  from: string;
  features: string;
  isPopular: boolean;
  billingCycles: Tariff['billingCycles'];
  basePrice: number | null;
  orderIndex: number;

  static fromEntity(tariff: Tariff): TariffResponseDto {
    const dto = new TariffResponseDto();
    dto.id = tariff.id;
    dto.serviceId = tariff.serviceId;
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

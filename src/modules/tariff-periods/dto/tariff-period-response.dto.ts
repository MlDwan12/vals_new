import { TariffPeriod } from '../domain/tariff-period.entity';

export class TariffPeriodResponseDto {
  id: number;
  months: number;
  discountPercent: number | null;

  static fromEntity(period: TariffPeriod): TariffPeriodResponseDto {
    const dto = new TariffPeriodResponseDto();
    dto.id = period.id;
    dto.months = period.months;
    dto.discountPercent = period.discountPercent;
    return dto;
  }
}

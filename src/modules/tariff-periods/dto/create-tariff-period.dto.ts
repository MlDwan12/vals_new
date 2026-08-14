import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class CreateTariffPeriodDto {
  @IsInt()
  @Min(1)
  months: number;

  @IsInt()
  @IsOptional()
  @Min(0)
  @Max(100)
  discountPercent?: number;
}

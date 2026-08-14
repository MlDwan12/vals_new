import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateTariffDto {
  @IsInt()
  serviceId: number;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  from: string;

  @IsString()
  @IsNotEmpty()
  features: string;

  @IsBoolean()
  @IsOptional()
  isPopular?: boolean;

  @IsInt()
  @IsOptional()
  orderIndex?: number;

  @IsInt()
  @Min(0)
  basePrice: number;

  // ID периодов оплаты — если не передать, тарифу присваивается один синтетический цикл
  // "1 месяц по базовой цене" (см. TariffsService.buildBillingCycles).
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @IsOptional()
  periodIds?: number[];
}

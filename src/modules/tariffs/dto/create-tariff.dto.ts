import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
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

  // NOT NULL с дефолтом в БД — @IsOptional() пропустил бы явный null мимо валидации на PATCH
  // (code review, тот же приём, что у priority/hasToc в статьях/кейсах).
  @IsBoolean()
  @ValidateIf((_, value) => value !== undefined)
  isPopular?: boolean;

  @IsInt()
  @ValidateIf((_, value) => value !== undefined)
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

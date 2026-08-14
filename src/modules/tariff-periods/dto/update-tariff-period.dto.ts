import { PartialType } from '@nestjs/mapped-types';
import { CreateTariffPeriodDto } from './create-tariff-period.dto';

export class UpdateTariffPeriodDto extends PartialType(CreateTariffPeriodDto) {}

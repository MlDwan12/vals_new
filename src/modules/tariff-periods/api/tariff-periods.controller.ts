import { Controller, Get } from '@nestjs/common';
import { Public } from '../../../core/decorators/public.decorator';
import { TariffPeriodsService } from '../application/tariff-periods.service';
import { TariffPeriodResponseDto } from '../dto/tariff-period-response.dto';

@Controller('tariff-periods')
export class TariffPeriodsController {
  constructor(private readonly tariffPeriodsService: TariffPeriodsService) {}

  @Public()
  @Get()
  findAll(): Promise<TariffPeriodResponseDto[]> {
    return this.tariffPeriodsService.findAll();
  }
}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TariffPeriodsAdminController } from './api/tariff-periods-admin.controller';
import { TariffPeriodsController } from './api/tariff-periods.controller';
import { TariffPeriodsService } from './application/tariff-periods.service';
import { TariffPeriod } from './domain/tariff-period.entity';
import { TariffPeriodsRepository } from './infrastructure/tariff-periods.repository';

@Module({
  imports: [TypeOrmModule.forFeature([TariffPeriod])],
  controllers: [TariffPeriodsController, TariffPeriodsAdminController],
  providers: [TariffPeriodsService, TariffPeriodsRepository],
  exports: [TariffPeriodsRepository],
})
export class TariffPeriodsModule {}

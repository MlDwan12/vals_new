import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TariffsModule } from '../tariffs/tariffs.module';
import { TariffPeriodsAdminController } from './api/tariff-periods-admin.controller';
import { TariffPeriodsController } from './api/tariff-periods.controller';
import { TariffPeriodsService } from './application/tariff-periods.service';
import { TariffPeriod } from './domain/tariff-period.entity';
import { TariffPeriodsRepository } from './infrastructure/tariff-periods.repository';

// forwardRef — см. комментарий в tariffs.module.ts: настоящий цикл модулей (TariffsModule нужен
// TariffPeriodsRepository, TariffPeriodsModule — TariffsRepository), не единичное удобство.
@Module({
  imports: [
    TypeOrmModule.forFeature([TariffPeriod]),
    forwardRef(() => TariffsModule),
  ],
  controllers: [TariffPeriodsController, TariffPeriodsAdminController],
  providers: [TariffPeriodsService, TariffPeriodsRepository],
  exports: [TariffPeriodsRepository],
})
export class TariffPeriodsModule {}

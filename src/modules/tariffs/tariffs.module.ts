import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TariffPeriodsModule } from '../tariff-periods/tariff-periods.module';
import { ServicesModule } from '../services/services.module';
import { TariffsAdminController } from './api/tariffs-admin.controller';
import { TariffsService } from './application/tariffs.service';
import { Tariff } from './domain/tariff.entity';
import { TariffsRepository } from './infrastructure/tariffs.repository';

// forwardRef — настоящий цикл модулей, не просто удобство: TariffsService нужен
// TariffPeriodsRepository (резолв периодов при сборке billingCycles), а TariffPeriodsService —
// TariffsRepository (запрет удаления периода, используемого в тарифах, Б5, независимый аудит
// 2026-08-21). Провайдеры при этом друг друга напрямую не инжектируют — цикл только на уровне
// графа модулей, не провайдеров.
@Module({
  imports: [
    TypeOrmModule.forFeature([Tariff]),
    ServicesModule,
    forwardRef(() => TariffPeriodsModule),
  ],
  controllers: [TariffsAdminController],
  providers: [TariffsService, TariffsRepository],
  exports: [TariffsRepository],
})
export class TariffsModule {}

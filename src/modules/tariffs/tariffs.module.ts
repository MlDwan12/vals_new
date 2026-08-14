import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TariffPeriodsModule } from '../tariff-periods/tariff-periods.module';
import { ServicesModule } from '../services/services.module';
import { TariffsAdminController } from './api/tariffs-admin.controller';
import { TariffsService } from './application/tariffs.service';
import { Tariff } from './domain/tariff.entity';
import { TariffsRepository } from './infrastructure/tariffs.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tariff]),
    ServicesModule,
    TariffPeriodsModule,
  ],
  controllers: [TariffsAdminController],
  providers: [TariffsService, TariffsRepository],
})
export class TariffsModule {}

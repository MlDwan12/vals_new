import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TariffPeriod } from './domain/tariff-period.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TariffPeriod])],
})
export class TariffPeriodsModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tariff } from './domain/tariff.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Tariff])],
})
export class TariffsModule {}

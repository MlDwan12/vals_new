import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Industry } from './domain/industry.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Industry])],
})
export class IndustriesModule {}

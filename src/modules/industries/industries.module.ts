import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IndustriesAdminController } from './api/industries-admin.controller';
import { IndustriesController } from './api/industries.controller';
import { IndustriesService } from './application/industries.service';
import { Industry } from './domain/industry.entity';
import { IndustriesRepository } from './infrastructure/industries.repository';

@Module({
  imports: [TypeOrmModule.forFeature([Industry])],
  controllers: [IndustriesController, IndustriesAdminController],
  providers: [IndustriesService, IndustriesRepository],
})
export class IndustriesModule {}

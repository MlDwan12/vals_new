import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Service } from './domain/service.entity';
import { ServiceCategory } from './domain/service-category.entity';
import { ServiceFaq } from './domain/service-faq.entity';
import { ServiceStep } from './domain/service-step.entity';
import { ServicesRepository } from './infrastructure/services.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Service,
      ServiceCategory,
      ServiceStep,
      ServiceFaq,
    ]),
  ],
  providers: [ServicesRepository],
  exports: [ServicesRepository],
})
export class ServicesModule {}

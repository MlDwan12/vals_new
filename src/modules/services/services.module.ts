import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Case } from '../cases/domain/case.entity';
import { SearchModule } from '../search/search.module';
import { ServiceCategoriesAdminController } from './api/service-categories-admin.controller';
import { ServiceCategoriesController } from './api/service-categories.controller';
import { ServiceFaqAdminController } from './api/service-faq-admin.controller';
import { ServiceRelationsAdminController } from './api/service-relations-admin.controller';
import { ServiceStepsAdminController } from './api/service-steps-admin.controller';
import { ServicesAdminController } from './api/services-admin.controller';
import { ServicesController } from './api/services.controller';
import { ServiceCategoriesService } from './application/service-categories.service';
import { ServiceFaqService } from './application/service-faq.service';
import { ServiceRelationsService } from './application/service-relations.service';
import { ServicesReindexScheduler } from './application/services-reindex.scheduler';
import { ServiceStepsService } from './application/service-steps.service';
import { ServicesService } from './application/services.service';
import { ServiceCategory } from './domain/service-category.entity';
import { ServiceFaq } from './domain/service-faq.entity';
import { ServiceRelation } from './domain/service-relation.entity';
import { ServiceStep } from './domain/service-step.entity';
import { Service } from './domain/service.entity';
import { ServiceCategoriesRepository } from './infrastructure/service-categories.repository';
import { ServiceFaqRepository } from './infrastructure/service-faq.repository';
import { ServiceRelationsRepository } from './infrastructure/service-relations.repository';
import { ServiceStepsRepository } from './infrastructure/service-steps.repository';
import { ServicesRepository } from './infrastructure/services.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Service,
      ServiceCategory,
      ServiceStep,
      ServiceFaq,
      ServiceRelation,
      Case,
    ]),
    SearchModule,
  ],
  controllers: [
    ServicesController,
    ServicesAdminController,
    ServiceCategoriesController,
    ServiceCategoriesAdminController,
    ServiceStepsAdminController,
    ServiceFaqAdminController,
    ServiceRelationsAdminController,
  ],
  providers: [
    ServicesService,
    ServicesRepository,
    ServiceCategoriesService,
    ServiceCategoriesRepository,
    ServiceStepsService,
    ServiceStepsRepository,
    ServiceFaqService,
    ServiceFaqRepository,
    ServiceRelationsService,
    ServiceRelationsRepository,
    ServicesReindexScheduler,
  ],
  exports: [ServicesRepository],
})
export class ServicesModule {}

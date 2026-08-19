import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeesModule } from '../employees/employees.module';
import { SearchModule } from '../search/search.module';
import { ServicesModule } from '../services/services.module';
import { TagsModule } from '../tags/tags.module';
import { CaseFaqAdminController } from './api/case-faq-admin.controller';
import { CasesAdminController } from './api/cases-admin.controller';
import { CasesController } from './api/cases.controller';
import { CaseFaqService } from './application/case-faq.service';
import { CasesReindexScheduler } from './application/cases-reindex.scheduler';
import { CasesService } from './application/cases.service';
import { CaseFaq } from './domain/case-faq.entity';
import { Case } from './domain/case.entity';
import { CaseFaqRepository } from './infrastructure/case-faq.repository';
import { CasesRepository } from './infrastructure/cases.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([Case, CaseFaq]),
    EmployeesModule,
    TagsModule,
    ServicesModule,
    SearchModule,
  ],
  controllers: [CasesController, CasesAdminController, CaseFaqAdminController],
  providers: [
    CasesService,
    CasesRepository,
    CaseFaqService,
    CaseFaqRepository,
    CasesReindexScheduler,
  ],
  exports: [CasesRepository],
})
export class CasesModule {}

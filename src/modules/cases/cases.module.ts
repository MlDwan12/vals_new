import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeesModule } from '../employees/employees.module';
import { ServicesModule } from '../services/services.module';
import { TagsModule } from '../tags/tags.module';
import { CaseFaqAdminController } from './api/case-faq-admin.controller';
import { CasesAdminController } from './api/cases-admin.controller';
import { CasesController } from './api/cases.controller';
import { CaseFaqService } from './application/case-faq.service';
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
  ],
  controllers: [CasesController, CasesAdminController, CaseFaqAdminController],
  providers: [CasesService, CasesRepository, CaseFaqService, CaseFaqRepository],
})
export class CasesModule {}

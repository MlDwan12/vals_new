import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CasesModule } from '../cases/cases.module';
import { IndustriesModule } from '../industries/industries.module';
import { MediaModule } from '../media/media.module';
import { SearchModule } from '../search/search.module';
import { ServicesModule } from '../services/services.module';
import { LandingFaqAdminController } from './api/landing-faq-admin.controller';
import { LandingsAdminController } from './api/landings-admin.controller';
import { LandingsController } from './api/landings.controller';
import { LandingFaqService } from './application/landing-faq.service';
import { LandingsReindexScheduler } from './application/landings-reindex.scheduler';
import { LandingsService } from './application/landings.service';
import { LandingFaq } from './domain/landing-faq.entity';
import { Landing } from './domain/landing.entity';
import { LandingFaqRepository } from './infrastructure/landing-faq.repository';
import { LandingsRepository } from './infrastructure/landings.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([Landing, LandingFaq]),
    ServicesModule,
    IndustriesModule,
    CasesModule,
    MediaModule,
    SearchModule,
  ],
  controllers: [
    LandingsController,
    LandingsAdminController,
    LandingFaqAdminController,
  ],
  providers: [
    LandingsService,
    LandingsRepository,
    LandingFaqService,
    LandingFaqRepository,
    LandingsReindexScheduler,
  ],
  exports: [LandingsRepository],
})
export class LandingsModule {}

import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { SingleFlightGuard } from '../../../core/scheduling/single-flight-guard';
import { SearchIndexService } from '../../search/application/search-index.service';
import { ServicesService } from './services.service';

// Тот же периодический reindex, что и у статей/кейсов (ArticlesReindexScheduler) — до этого у
// services не было вообще никакого автоматического reindex, только ручная кнопка в админке
// (M7 code review).
@Injectable()
export class ServicesReindexScheduler {
  private readonly guard: SingleFlightGuard;

  constructor(
    private readonly servicesService: ServicesService,
    private readonly searchIndexService: SearchIndexService,
    logger: PinoLogger,
  ) {
    logger.setContext(ServicesReindexScheduler.name);
    this.guard = new SingleFlightGuard(logger, 'services reindex');
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  run(): Promise<void> {
    return this.guard.run(async () => {
      await this.searchIndexService.tryEnsureIndex();
      await this.servicesService.reindexSearch();
    });
  }
}

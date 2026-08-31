import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { SingleFlightGuard } from '../../../core/scheduling/single-flight-guard';
import { SearchIndexService } from '../../search/application/search-index.service';
import { LandingsService } from './landings.service';

// Тот же приём, что ArticlesReindexScheduler/CasesReindexScheduler/NewsReindexScheduler —
// снятие с публикации само не покидает поиск, единственное, что реиндексирует страницу, это
// create/update/remove/reindex.
@Injectable()
export class LandingsReindexScheduler {
  private readonly guard: SingleFlightGuard;

  constructor(
    private readonly landingsService: LandingsService,
    private readonly searchIndexService: SearchIndexService,
    logger: PinoLogger,
  ) {
    logger.setContext(LandingsReindexScheduler.name);
    this.guard = new SingleFlightGuard(logger, 'landings reindex');
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  run(): Promise<void> {
    return this.guard.run(async () => {
      await this.searchIndexService.tryEnsureIndex();
      await this.landingsService.reindexSearch();
    });
  }
}

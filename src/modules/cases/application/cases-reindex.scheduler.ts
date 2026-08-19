import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { SingleFlightGuard } from '../../../core/scheduling/single-flight-guard';
import { SearchIndexService } from '../../search/application/search-index.service';
import { CasesService } from './cases.service';

// Тот же пробел, что и у статей (см. ArticlesReindexScheduler) — отложенная публикация кейса сама
// не попадает в поиск без периодического reindex (H7 code review).
@Injectable()
export class CasesReindexScheduler {
  private readonly guard: SingleFlightGuard;

  constructor(
    private readonly casesService: CasesService,
    private readonly searchIndexService: SearchIndexService,
    logger: PinoLogger,
  ) {
    logger.setContext(CasesReindexScheduler.name);
    this.guard = new SingleFlightGuard(logger, 'cases reindex');
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  run(): Promise<void> {
    return this.guard.run(async () => {
      await this.searchIndexService.tryEnsureIndex();
      await this.casesService.reindexSearch();
    });
  }
}

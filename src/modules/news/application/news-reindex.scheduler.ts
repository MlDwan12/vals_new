import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { SingleFlightGuard } from '../../../core/scheduling/single-flight-guard';
import { SearchIndexService } from '../../search/application/search-index.service';
import { NewsService } from './news.service';

// Тот же приём, что ArticlesReindexScheduler/CasesReindexScheduler — отложенная публикация сама не
// попадает в поиск, единственное, что индексирует новость, это create/update/remove/reindex.
@Injectable()
export class NewsReindexScheduler {
  private readonly guard: SingleFlightGuard;

  constructor(
    private readonly newsService: NewsService,
    private readonly searchIndexService: SearchIndexService,
    logger: PinoLogger,
  ) {
    logger.setContext(NewsReindexScheduler.name);
    this.guard = new SingleFlightGuard(logger, 'news reindex');
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  run(): Promise<void> {
    return this.guard.run(async () => {
      await this.searchIndexService.tryEnsureIndex();
      await this.newsService.reindexSearch();
    });
  }
}

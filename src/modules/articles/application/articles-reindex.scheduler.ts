import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { SingleFlightGuard } from '../../../core/scheduling/single-flight-guard';
import { SearchIndexService } from '../../search/application/search-index.service';
import { ArticlesService } from './articles.service';

// Отложенная публикация (datePublished в будущем) сама не попадает в поиск — единственное, что
// индексирует статью, это create/update/remove/reindex через админку. Без периодического тика
// статья с наступившей запланированной датой публикации видна на сайте (запросы динамические), но
// не находится через поиск, пока кто-то не откроет и не сохранит её в админке или не нажмёт
// reindex вручную (H7 code review).
@Injectable()
export class ArticlesReindexScheduler {
  private readonly guard: SingleFlightGuard;

  constructor(
    private readonly articlesService: ArticlesService,
    private readonly searchIndexService: SearchIndexService,
    logger: PinoLogger,
  ) {
    logger.setContext(ArticlesReindexScheduler.name);
    this.guard = new SingleFlightGuard(logger, 'articles reindex');
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  run(): Promise<void> {
    return this.guard.run(async () => {
      // Self-heal: если Meilisearch был недоступен на старте приложения, индекс так и остался
      // ненастроенным — ensureIndex() идемпотентен, повторный вызов не вредит (LOW code review).
      await this.searchIndexService.tryEnsureIndex();
      await this.articlesService.reindexSearch();
    });
  }
}

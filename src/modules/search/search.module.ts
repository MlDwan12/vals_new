import { Module } from '@nestjs/common';
import { SearchController } from './api/search.controller';
import { SearchIndexService } from './application/search-index.service';

// Без domain/infrastructure — у модуля нет собственной сущности в БД (как health на этапе 0),
// только обёртка над Meilisearch. Импортируется модулями articles/cases/services для живой
// индексации при мутациях (SearchModule → ничего не знает про контент-модули, зависимость
// однонаправленная, циклов нет).
@Module({
  controllers: [SearchController],
  providers: [SearchIndexService],
  exports: [SearchIndexService],
})
export class SearchModule {}

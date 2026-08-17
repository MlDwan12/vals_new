import {
  Injectable,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Meilisearch } from 'meilisearch';
import { PinoLogger } from 'nestjs-pino';
import { EnvConfig } from '../../../config/env.validation';
import { GlobalSearchDocument } from './global-search-document.interface';

const INDEX_NAME = 'global_search';

export interface SearchPage {
  items: GlobalSearchDocument[];
  total: number;
}

// Два клиента с разными ключами (ТЗ §6 — приложение не должно ходить в поиск мастер-ключом):
// adminClient (индексация/reindex, серверные операции) и searchClient (только GET /search).
@Injectable()
export class SearchIndexService implements OnModuleInit {
  private readonly adminClient: Meilisearch;
  private readonly searchClient: Meilisearch;

  constructor(
    configService: ConfigService<EnvConfig, true>,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SearchIndexService.name);
    const host = configService.get('MEILI_HOST', { infer: true });
    this.adminClient = new Meilisearch({
      host,
      apiKey: configService.get('MEILI_MASTER_KEY', { infer: true }),
    });
    this.searchClient = new Meilisearch({
      host,
      apiKey: configService.get('MEILI_SEARCH_KEY', { infer: true }),
    });
  }

  // Недоступность Meilisearch на старте не должна ронять приложение (ТЗ §7 п.2) — старый код падал
  // здесь без обработки (`ensureIndex()` в `onModuleInit` без try/catch вокруг сетевых вызовов).
  async onModuleInit(): Promise<void> {
    try {
      await this.ensureIndex();
    } catch (error) {
      this.logger.warn(
        { err: error },
        'Meilisearch недоступен при старте — индекс не настроен, поиск деградирован',
      );
    }
  }

  async upsertDocuments(documents: GlobalSearchDocument[]): Promise<void> {
    if (documents.length === 0) return;
    try {
      await this.adminClient.index(INDEX_NAME).addDocuments(documents);
    } catch (error) {
      this.logger.warn(
        { err: error, count: documents.length },
        'Не удалось обновить документы в индексе поиска',
      );
    }
  }

  async deleteDocuments(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      await this.adminClient.index(INDEX_NAME).deleteDocuments(ids);
    } catch (error) {
      this.logger.warn(
        { err: error, count: ids.length },
        'Не удалось удалить документы из индекса поиска',
      );
    }
  }

  async search(
    query: string,
    page: number,
    limit: number,
  ): Promise<SearchPage> {
    try {
      const offset = (page - 1) * limit;
      const result = await this.searchClient
        .index<GlobalSearchDocument>(INDEX_NAME)
        .search(query, { limit, offset });
      return {
        items: result.hits,
        total: result.estimatedTotalHits ?? result.hits.length,
      };
    } catch (error) {
      this.logger.warn({ err: error, query }, 'Поиск временно недоступен');
      throw new ServiceUnavailableException('Поиск временно недоступен');
    }
  }

  private async ensureIndex(): Promise<void> {
    try {
      await this.adminClient.createIndex(INDEX_NAME, { primaryKey: 'id' });
    } catch {
      // индекс уже существует — не фатально
    }

    const index = this.adminClient.index<GlobalSearchDocument>(INDEX_NAME);
    await index.updateSearchableAttributes(['title', 'description']);
    await index.updateFilterableAttributes(['entityType']);
  }
}

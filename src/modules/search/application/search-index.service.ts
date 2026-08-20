import {
  Injectable,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Meilisearch } from 'meilisearch';
import { PinoLogger } from 'nestjs-pino';
import { EnvConfig } from '../../../config/env.validation';
import {
  GlobalSearchDocument,
  SearchEntityType,
} from './global-search-document.interface';

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
  // Дедуп конкурентных getDocumentIds(entityType) — три reindex-шедулера (articles/cases/services)
  // с одинаковым EVERY_5_MINUTES тиком независимо запрашивают 'faq' (общий для всех трёх доменов
  // entityType), проваливаясь в 3x одинаковый полный скан индекса на каждый тик без этого
  // (efficiency review). Один in-flight запрос на entityType — конкурентные вызовы ждут тот же
  // промис вместо нового похода в Meilisearch.
  private readonly inFlightGetDocumentIds = new Map<
    SearchEntityType,
    Promise<string[]>
  >();

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
    await this.tryEnsureIndex();
  }

  // Публичный self-heal: если Meilisearch был недоступен на старте, onModuleInit молча пропустил
  // настройку индекса — без повторных попыток индекс так и остаётся ненастроенным всю жизнь
  // процесса (LOW code review). Периодические reindex-тики (H7/M7) вызывают это перед каждым
  // прогоном — ensureIndex() идемпотентен, self-heal происходит в течение 5 минут после того, как
  // Meilisearch снова станет доступен.
  async tryEnsureIndex(): Promise<void> {
    try {
      await this.ensureIndex();
    } catch (error) {
      this.logger.warn(
        { err: error },
        'Meilisearch недоступен — индекс не настроен, поиск деградирован',
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

  // Все id документов данного entityType, реально лежащих в индексе сейчас — нужно для
  // reindexSearch(), чтобы находить и чистить "осиротевшие" документы (например, unpublish/delete
  // не долетел до Meilisearch из-за временной недоступности — upsert-only reindex сам их никогда
  // не находит, M7 code review). Пустой массив при ошибке — reindex просто пропустит очистку
  // stale-документов на этом тике, не должен упасть целиком.
  getDocumentIds(entityType: SearchEntityType): Promise<string[]> {
    const inFlight = this.inFlightGetDocumentIds.get(entityType);
    if (inFlight) return inFlight;

    const promise = this.fetchDocumentIds(entityType).finally(() => {
      this.inFlightGetDocumentIds.delete(entityType);
    });
    this.inFlightGetDocumentIds.set(entityType, promise);
    return promise;
  }

  private async fetchDocumentIds(
    entityType: SearchEntityType,
  ): Promise<string[]> {
    const ids: string[] = [];
    const limit = 1000;
    let offset = 0;

    try {
      for (;;) {
        const page = await this.adminClient
          .index<GlobalSearchDocument>(INDEX_NAME)
          .getDocuments({
            filter: `entityType = ${entityType}`,
            limit,
            offset,
          });
        ids.push(...page.results.map((doc) => doc.id));
        if (page.results.length < limit) break;
        offset += limit;
      }
      return ids;
    } catch (error) {
      this.logger.warn(
        { err: error, entityType },
        'Не удалось прочитать список документов индекса для очистки stale-записей',
      );
      return [];
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

  // Единая логика очистки "осиротевших" документов для articles/cases/services reindexSearch()
  // (было 3 копии одного и того же — simplification/altitude review). entityType — сущность
  // домена ('article'/'case'/'service'), faqIdPrefix — префикс id её FAQ-документов
  // ('articleFaq_'/'caseFaq_'/'serviceFaq_'), т.к. все FAQ трёх доменов делят один общий
  // entityType='faq' в индексе (getDocumentIds('faq') дедуплицируется между тремя вызовами через
  // inFlightGetDocumentIds выше).
  async reconcileStaleDocuments(
    entityType: SearchEntityType,
    faqIdPrefix: string,
    currentIds: ReadonlySet<string>,
  ): Promise<void> {
    const [existingEntityIds, existingFaqIds] = await Promise.all([
      this.getDocumentIds(entityType),
      this.getDocumentIds('faq'),
    ]);

    // currentIds пуст, а в индексе уже есть документы этого домена — подозрительно (не та БД в
    // конфиге, откатившая миграция, случайный прогон против тестовой базы), не обязательно
    // «домен реально опустел». Полное удаление по такому сигналу опаснее, чем оставить индекс
    // временно неактуальным до следующего тика — пропускаем очистку, а не чистим вслепую (R7,
    // round-2 review: без этого guard'а такой баг стирал бы весь домен из поиска 288 раз в сутки).
    if (currentIds.size === 0 && existingEntityIds.length > 0) {
      this.logger.error(
        { entityType, indexedCount: existingEntityIds.length },
        'reconcileStaleDocuments: currentIds пуст, а в индексе есть документы — очистка пропущена',
      );
      return;
    }

    const staleIds = [
      ...existingEntityIds,
      ...existingFaqIds.filter((id) => id.startsWith(faqIdPrefix)),
    ].filter((id) => !currentIds.has(id));

    if (staleIds.length > 0) {
      await this.deleteDocuments(staleIds);
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

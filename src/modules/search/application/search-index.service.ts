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
// Meilisearch-клиент без timeout не оборачивает запрос в AbortController вообще (проверено по
// node_modules/meilisearch/dist/index.js) — при зависшем (не «недоступен», а именно не отвечающем)
// Meilisearch onModuleInit/reindex-тик может повиснуть бессрочно, SingleFlightGuard держит
// isRunning=true вечно и блокирует все следующие тики. Тот же порядок величины, что у Bitrix
// (bitrix-client.ts).
const MEILISEARCH_TIMEOUT_MS = 10_000;
// Сколько подряд идущих подозрительных тиков (см. reconcileStaleDocuments) нужно, прежде чем
// доверять «currentIds пуст» и выполнить очистку — не 1 (разовый сбой конфигурации/гонка с
// миграцией не должны стирать индекс) и не бесконечность (N-6, round-3 review: легитимная массовая
// расчистка публикаций иначе блокирует очистку навсегда). При EVERY_5_MINUTES это 15 минут.
const SUSPICIOUS_EMPTY_STREAK_THRESHOLD = 3;

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
  // Число подряд идущих подозрительных тиков reconcileStaleDocuments на домен (N-6, round-3
  // review) — см. SUSPICIOUS_EMPTY_STREAK_THRESHOLD.
  private readonly suspiciousEmptyStreak = new Map<SearchEntityType, number>();

  constructor(
    configService: ConfigService<EnvConfig, true>,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SearchIndexService.name);
    const host = configService.get('MEILI_HOST', { infer: true });
    this.adminClient = new Meilisearch({
      host,
      apiKey: configService.get('MEILI_MASTER_KEY', { infer: true }),
      timeout: MEILISEARCH_TIMEOUT_MS,
    });
    this.searchClient = new Meilisearch({
      host,
      apiKey: configService.get('MEILI_SEARCH_KEY', { infer: true }),
      timeout: MEILISEARCH_TIMEOUT_MS,
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
    const existingDomainFaqIds = existingFaqIds.filter((id) =>
      id.startsWith(faqIdPrefix),
    );
    // Подозрительность считаем и по FAQ-документам домена, не только по entity (N-6, round-3
    // review) — staleIds ниже удаляет оба вида, а раньше guard смотрел только на entity: пустая
    // таблица сущности при осиротевших FAQ-документах проходила без всякой защиты.
    const indexedCount = existingEntityIds.length + existingDomainFaqIds.length;

    // currentIds пуст, а в индексе уже есть документы этого домена — подозрительно (не та БД в
    // конфиге, откатившая миграция, случайный прогон против тестовой базы), не обязательно
    // «домен реально опустел». Полное удаление по такому сигналу опаснее, чем оставить индекс
    // временно неактуальным — но пропуск не может быть бессрочным: легитимная массовая расчистка
    // публикаций (сняли с публикации все статьи/кейсы/услуги домена разом) даёт то же самое
    // «currentIds пуст» на каждом тике, и без порога чистка была бы недостижима НИКОГДА (N-6,
    // round-3 review — регрессия собственного фикса R7 из round-2). Порог по числу подряд идущих
    // тиков: разовый сбой не проходит, легитимная расчистка проходит с ограниченной задержкой.
    if (currentIds.size === 0 && indexedCount > 0) {
      const streak = (this.suspiciousEmptyStreak.get(entityType) ?? 0) + 1;
      this.suspiciousEmptyStreak.set(entityType, streak);

      if (streak < SUSPICIOUS_EMPTY_STREAK_THRESHOLD) {
        this.logger.error(
          { entityType, indexedCount, streak },
          'reconcileStaleDocuments: currentIds пуст, а в индексе есть документы — очистка отложена',
        );
        return;
      }

      this.logger.warn(
        { entityType, indexedCount, streak },
        'reconcileStaleDocuments: подозрительное состояние подтвердилось несколько тиков подряд — выполняем очистку',
      );
    } else {
      this.suspiciousEmptyStreak.delete(entityType);
    }

    const staleIds = [...existingEntityIds, ...existingDomainFaqIds].filter(
      (id) => !currentIds.has(id),
    );

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

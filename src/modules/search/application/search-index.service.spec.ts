import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import { EnvConfig } from '../../../config/env.validation';
import { SearchEntityType } from './global-search-document.interface';
import { SearchIndexService } from './search-index.service';

// meilisearch — чистый ESM-пакет (package.json: "type": "module"), Jest (CJS-транспиляция через
// ts-jest) не может импортировать его напрямую (SyntaxError: Unexpected token 'export'). Мокаем
// модуль целиком — тест бьёт по логике reconcileStaleDocuments (через spy на публичные
// getDocumentIds/deleteDocuments), не по реальному HTTP-клиенту, конструктор всё равно не должен
// быть достигнут.
jest.mock('meilisearch', () => ({
  Meilisearch: jest.fn().mockImplementation(() => ({})),
}));

function buildLogger(): PinoLogger {
  return {
    setContext: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as PinoLogger;
}

function buildConfigService(): ConfigService<EnvConfig, true> {
  const values: Record<string, string> = {
    MEILI_HOST: 'http://meilisearch.invalid',
    MEILI_MASTER_KEY: 'master',
    MEILI_SEARCH_KEY: 'search',
  };
  return { get: (key: string) => values[key] } as unknown as ConfigService<
    EnvConfig,
    true
  >;
}

function buildService(
  getDocumentIdsByType: Partial<Record<SearchEntityType, string[]>>,
): { service: SearchIndexService; deleteSpy: jest.SpyInstance } {
  const service = new SearchIndexService(buildConfigService(), buildLogger());
  jest
    .spyOn(service, 'getDocumentIds')
    .mockImplementation((entityType) =>
      Promise.resolve(getDocumentIdsByType[entityType] ?? []),
    );
  const deleteSpy = jest
    .spyOn(service, 'deleteDocuments')
    .mockResolvedValue(undefined);
  return { service, deleteSpy };
}

// N-6 (round-3 review): guard от «currentIds пуст, а в индексе есть документы» (R7, round-2
// review) был детерминированным — если легитимно сняли с публикации ВСЕ статьи/кейсы/услуги
// домена разом, currentIds пуст на каждом тике вечно, и чистка не выполнялась НИКОГДА.
describe('SearchIndexService.reconcileStaleDocuments', () => {
  it('пропускает очистку на первых подозрительных тиках, но выполняет после порога (легитимный mass-unpublish)', async () => {
    const { service, deleteSpy } = buildService({
      article: ['article_1', 'article_2'],
    });

    await service.reconcileStaleDocuments('article', 'articleFaq_', new Set());
    await service.reconcileStaleDocuments('article', 'articleFaq_', new Set());
    expect(deleteSpy).not.toHaveBeenCalled();

    await service.reconcileStaleDocuments('article', 'articleFaq_', new Set());
    expect(deleteSpy).toHaveBeenCalledWith(['article_1', 'article_2']);
  });

  it('сбрасывает счётчик подозрительных тиков, как только состояние снова легитимно', async () => {
    const { service, deleteSpy } = buildService({ article: ['article_1'] });

    await service.reconcileStaleDocuments('article', 'articleFaq_', new Set()); // streak=1
    await service.reconcileStaleDocuments(
      'article',
      'articleFaq_',
      new Set(['article_1']),
    ); // легитимно (article_1 реально опубликован) — сброс, ничего не удаляет
    expect(deleteSpy).not.toHaveBeenCalled();

    await service.reconcileStaleDocuments('article', 'articleFaq_', new Set()); // streak=1 снова, не 2
    await service.reconcileStaleDocuments('article', 'articleFaq_', new Set()); // streak=2
    expect(deleteSpy).not.toHaveBeenCalled();

    await service.reconcileStaleDocuments('article', 'articleFaq_', new Set()); // streak=3 → чистит
    expect(deleteSpy).toHaveBeenCalledWith(['article_1']);
  });

  it('учитывает осиротевшие FAQ-документы домена в подозрительной проверке, не только entity', async () => {
    // entity-документов в индексе нет вовсе, но остались осиротевшие FAQ — раньше guard смотрел
    // только на existingEntityIds и такое состояние проходило без всякой защиты.
    const { service, deleteSpy } = buildService({
      faq: ['articleFaq_1'],
    });

    await service.reconcileStaleDocuments('article', 'articleFaq_', new Set());
    await service.reconcileStaleDocuments('article', 'articleFaq_', new Set());
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('не подозрительное состояние (currentIds не пуст) — чистит staleIds сразу, без задержки', async () => {
    const { service, deleteSpy } = buildService({
      article: ['article_1', 'article_2'],
    });

    await service.reconcileStaleDocuments(
      'article',
      'articleFaq_',
      new Set(['article_1']),
    );

    expect(deleteSpy).toHaveBeenCalledWith(['article_2']);
  });

  it('индекс и БД оба пусты — ничего не удаляет и не считает подозрительным', async () => {
    const { service, deleteSpy } = buildService({});

    await service.reconcileStaleDocuments('article', 'articleFaq_', new Set());

    expect(deleteSpy).not.toHaveBeenCalled();
  });
});

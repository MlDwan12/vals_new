import { Test } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogRepository } from '../infrastructure/audit-log.repository';
import { AuditOutcome } from '../enums/audit-outcome.enum';
import { AuditService } from './audit.service';

// EXPANSION_TASKS.md §2.5 — падение записи в журнал не должно превращать успешную операцию в
// ошибку (log() — "выстрелил и забыл"). Тест напрямую на сервисе, без БД: репозиторий подставной,
// падающий на insert().
describe('AuditService.log', () => {
  it('не бросает исключение, если репозиторий падает — только предупреждение в лог', async () => {
    const repository = {
      insert: jest.fn().mockRejectedValue(new Error('БД недоступна')),
    };
    const logger = { setContext: jest.fn(), warn: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: AuditLogRepository, useValue: repository },
        { provide: PinoLogger, useValue: logger },
      ],
    }).compile();

    const service = moduleRef.get(AuditService);

    await expect(
      service.log({
        userId: 1,
        username: 'test',
        role: 'developer',
        action: 'CREATE',
        method: 'POST',
        path: '/admin/tags',
        resource: 'tags',
        resourceId: null,
        statusCode: 201,
        errorMessage: null,
        ip: null,
        meta: null,
        signed: true,
      }),
    ).resolves.toBeUndefined();

    expect(repository.insert).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});

// Фильтр исхода и справочник значений (срез G.1). Проверяется, что сервис доносит параметр до
// репозитория: сама SQL-ветка на подставном репозитории не проверяется — она снимается запросом
// по живой базе в приёмке среза.
describe('AuditService.findAll / findFacets', () => {
  const buildService = async (repository: Partial<AuditLogRepository>) => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuditService,
        { provide: AuditLogRepository, useValue: repository },
        {
          provide: PinoLogger,
          useValue: { setContext: jest.fn(), warn: jest.fn() },
        },
      ],
    }).compile();

    return moduleRef.get(AuditService);
  };

  it('исход доезжает до репозитория вместе с остальными фильтрами', async () => {
    const findAndCount = jest.fn().mockResolvedValue([[], 0]);
    const service = await buildService({ findAndCount });

    await service.findAll({
      page: 1,
      limit: 20,
      outcome: AuditOutcome.DENIED,
      resource: 'users',
    });

    expect(findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: AuditOutcome.DENIED,
        resource: 'users',
        page: 1,
        limit: 20,
      }),
    );
  });

  it('даты из запроса приходят в репозиторий объектами Date, а не строками', async () => {
    const findAndCount = jest.fn().mockResolvedValue([[], 0]);
    const service = await buildService({ findAndCount });

    await service.findAll({
      page: 1,
      limit: 20,
      dateFrom: '2026-09-01T00:00:00.000Z',
    });

    expect(findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        dateFrom: new Date('2026-09-01T00:00:00.000Z'),
      }),
    );
  });

  it('справочник значений отдаётся как есть', async () => {
    const facets = { actions: ['CREATE', 'LOGIN'], resources: ['auth'] };
    const service = await buildService({
      findFacets: jest.fn().mockResolvedValue(facets),
    });

    await expect(service.findFacets()).resolves.toEqual(facets);
  });
});

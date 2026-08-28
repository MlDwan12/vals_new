import { Test } from '@nestjs/testing';
import { PinoLogger } from 'nestjs-pino';
import { AuditLogRepository } from '../infrastructure/audit-log.repository';
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
      }),
    ).resolves.toBeUndefined();

    expect(repository.insert).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});

import { Writable } from 'node:stream';
import { pinoHttp } from 'pino-http';
import { QueryFailedError } from 'typeorm';
import { AxiosError } from 'axios';
import { safeErrSerializer } from './safe-err-serializer';

// Форма pg-ошибки (node_modules/pg-protocol: DatabaseError extends Error, поля code/detail/
// table/constraint/schema/severity выставляются парсером как собственные enumerable-свойства) —
// без зависимости от @types/pg (не установлен, ставить самостоятельно нельзя, см. CLAUDE.md).
// Сериализатор реагирует только на форму объекта (enumerable own properties), не на конкретный
// класс — этого достаточно для честной проверки.
class FakeDriverError extends Error {
  code?: string;
  detail?: string;
  table?: string;
  constraint?: string;
  schema?: string;
  severity?: string;
}

// N-4 (round-3 review): регресс-тест на реальных классах ошибок, не на моках — денилист-механизм
// (redact.paths по одному полю за раз) три раунда подряд пропускал новое поле, потому что набор
// полей задаёт драйвер, а не мы. Проверяем итоговый allowlist-сериализатор на живом
// QueryFailedError от unique-violation и живом AxiosError, а не на предположении о форме объекта.
describe('safeErrSerializer', () => {
  it('unique violation client_contacts — ПД контакта не попадает в лог, диагностика остаётся', () => {
    const driverError = new FakeDriverError(
      'duplicate key value violates unique constraint "client_contacts_type_value_key"',
    );
    Object.assign(driverError, {
      code: '23505',
      detail:
        'Key (type, value)=(EMAIL, ivan.petrov@example.com) already exists.',
      table: 'client_contacts',
      constraint: 'client_contacts_type_value_key',
      schema: 'public',
      severity: 'ERROR',
    });
    const err = new QueryFailedError(
      'INSERT INTO "client_contacts" ("type", "value") VALUES ($1, $2)',
      ['EMAIL', 'ivan.petrov@example.com'],
      driverError,
    );

    const result = safeErrSerializer(err) as Record<string, unknown>;
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('ivan.petrov@example.com');
    expect(result.detail).toBeUndefined();
    expect(
      (result.driverError as Record<string, unknown>)?.detail,
    ).toBeUndefined();

    // Диагностика для разбора инцидентов должна остаться.
    expect(result.code).toBe('23505');
    expect(result.constraint).toBe('client_contacts_type_value_key');
    expect(result.table).toBe('client_contacts');
  });

  it('AxiosError от Bitrix — секрет вебхука и ПД лида в config не попадают в лог', () => {
    const err = new AxiosError(
      'Request failed with status code 500',
      'ERR_BAD_RESPONSE',
      {
        url: 'https://bitrix.example.com/rest/1/SECRET_WEBHOOK_TOKEN/crm.lead.add.json',
        data: JSON.stringify({
          fields: { PHONE: [{ VALUE: '+79991234567' }] },
        }),
      } as never,
    );

    const result = safeErrSerializer(err) as Record<string, unknown>;
    const serialized = JSON.stringify(result);

    expect(serialized).not.toContain('SECRET_WEBHOOK_TOKEN');
    expect(serialized).not.toContain('+79991234567');
    expect(result.message).toBe('Request failed with status code 500');
    expect(result.config).toBeUndefined();
  });

  it('обычная ошибка — message/stack сохраняются как есть', () => {
    const err = new Error('что-то пошло не так');

    const result = safeErrSerializer(err) as Record<string, unknown>;

    expect(result.message).toBe('что-то пошло не так');
    expect(result.stack).toBe(err.stack);
    expect(result.type).toBe('Error');
  });

  it('минифицированный класс ошибки (сторонний бандл) — type падает на err.name, не на однобуквенный constructor.name', () => {
    // Воспроизводит форму реального MeilisearchRequestError из node_modules/meilisearch/dist
    // (minified): класс не переопределяет name, constructor.name схлопнут минификатором.
    class a extends Error {}
    const err = new a('Request to http://meilisearch.invalid has failed');

    const result = safeErrSerializer(err) as Record<string, unknown>;

    expect(result.type).toBe('Error');
  });

  it('не Error — возвращается как есть (defensive passthrough)', () => {
    const notAnError = { foo: 'bar' };

    expect(safeErrSerializer(notAnError)).toBe(notAnError);
  });

  // Регресс-тест на находку при построчной сверке N-4: pino-http оборачивает наш сериализатор
  // через wrapErrorSerializer (см. комментарий в safe-err-serializer.ts) — прямой вызов
  // safeErrSerializer(err) выше эту обёртку не проверяет и был зелёным даже тогда, когда в реальном
  // HTTP-запросе allowlist полностью обходился. Гоняем через настоящий pino-http с той же
  // конфигурацией serializers.err, что и в app.module.ts.
  it('через pino-http (реальный HTTP-контекст, wrapErrorSerializer) — ПД не утекает', () => {
    const chunks: Buffer[] = [];
    const destination = new Writable({
      write(chunk: Buffer, _enc, cb) {
        chunks.push(chunk);
        cb();
      },
    });
    const httpLogger = pinoHttp(
      { serializers: { err: safeErrSerializer } },
      destination,
    );

    const driverError = new FakeDriverError(
      'duplicate key value violates unique constraint "client_contacts_type_value_key"',
    );
    Object.assign(driverError, {
      code: '23505',
      detail:
        'Key (type, value)=(EMAIL, ivan.petrov@example.com) already exists.',
      table: 'client_contacts',
      constraint: 'client_contacts_type_value_key',
      schema: 'public',
      severity: 'ERROR',
    });
    const err = new QueryFailedError(
      'INSERT INTO "client_contacts" ("type", "value") VALUES ($1, $2)',
      ['EMAIL', 'ivan.petrov@example.com'],
      driverError,
    );

    httpLogger.logger.error({ err }, 'boom');

    const logged = JSON.parse(Buffer.concat(chunks).toString()) as {
      err: Record<string, unknown>;
    };
    const serialized = JSON.stringify(logged.err);

    expect(serialized).not.toContain('ivan.petrov@example.com');
    expect(logged.err.parameters).toBeUndefined();
    expect(logged.err.detail).toBeUndefined();
    expect(logged.err.code).toBe('23505');
    expect(logged.err.constraint).toBe('client_contacts_type_value_key');
  });
});

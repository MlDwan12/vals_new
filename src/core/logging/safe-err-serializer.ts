// Allowlist вместо denylist (N-4, round-3 review): дефолтный сериализатор pino копирует ВСЕ
// enumerable-поля ошибки (node_modules/pino-std-serializers/lib/err.js: `for (const key in err)`),
// включая всё, что TypeORM QueryFailedError скопировал с driverError (ObjectUtils.assign в
// QueryFailedError.js) — err.detail несёт значения нарушенного constraint (ПД лида при дубле
// client_contacts), а денилист по одному полю за раз (parameters → detail/driverError → …)
// неполон по построению: следующая версия драйвера принесёт следующее поле. Здесь наоборот —
// в лог попадает только то, что явно перечислено ниже.
const SAFE_ERR_FIELDS = [
  'code',
  'constraint',
  'table',
  'column',
  'schema',
  'severity',
] as const;

function pickSafeFields(
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of SAFE_ERR_FIELDS) {
    if (source[field] !== undefined) {
      result[field] = source[field];
    }
  }
  return result;
}

// constructor.name неинформативен для ошибок из минифицированных сторонних бандлов (замечено
// вживую на MeilisearchRequestError из node_modules/meilisearch/dist — минификатор схлопывает имя
// класса до одной буквы, например "a"). Такие классы не переопределяют err.name (остаётся
// унаследованный от Error.prototype "Error"), поэтому валидное PascalCase-имя длиной от 3 символов
// (TypeORM/pg/axios классы ошибок не минифицируются — QueryFailedError, AxiosError и т.п. проходят)
// в приоритете, иначе — err.name, иначе — просто "Error".
function readableErrorType(err: Error): string {
  const constructorName = err.constructor?.name;
  if (constructorName && /^[A-Z][A-Za-z0-9]{2,}$/.test(constructorName)) {
    return constructorName;
  }
  return err.name || 'Error';
}

// pino-http оборачивает наш сериализатор через wrapErrorSerializer
// (node_modules/pino-std-serializers/index.js): внутри HTTP-запроса (nestjs-pino логирует через
// req.log/pino-http, не через outOfContext-логгер) сюда приходит НЕ оригинальная ошибка, а уже
// готовый объект от штатного pino errSerializer — Object.create(pinoErrProto), НЕ instanceof Error,
// со ВСЕМИ enumerable-полями ошибки, скопированными как есть (err.js: `for (const key in err)`).
// Без разворачивания ниже `instanceof Error` не срабатывал и весь allowlist обходился — найдено
// построчной сверкой N-4, живой сценарий: unique-violation на client_contacts внутри HTTP-запроса
// утекал err.parameters/err.detail целиком, несмотря на allowlist. pino специально кладёт
// оригинальную ошибку в неenumerable err.raw (err-proto.js: accessor, enumerable:false) для таких
// случаев — разворачиваем через него. Вне HTTP-контекста (outOfContext-логгер, юнит-тесты) обёртки
// нет, err.raw отсутствует, работаем с самим err, как раньше.
function unwrapRawError(err: unknown): unknown {
  if (err && typeof err === 'object' && 'raw' in err) {
    return (err as { raw?: unknown }).raw;
  }
  return err;
}

// message для QueryFailedError (unique violation и т.п.) собирается TypeORM из
// driverError.toString() — обобщённый текст без конкретных значений (сами значения только в
// driverError.detail, который сюда не попадает). Для остальных ошибок — обычный err.message.
export function safeErrSerializer(err: unknown): unknown {
  const source = unwrapRawError(err);
  if (!(source instanceof Error)) {
    return err;
  }

  const safe: Record<string, unknown> = {
    type: readableErrorType(source),
    message: source.message,
    stack: source.stack,
    ...pickSafeFields(source as unknown as Record<string, unknown>),
  };

  const driverError = (source as { driverError?: unknown }).driverError;
  if (driverError && typeof driverError === 'object') {
    const safeDriverError = pickSafeFields(
      driverError as Record<string, unknown>,
    );
    if (Object.keys(safeDriverError).length > 0) {
      safe.driverError = safeDriverError;
    }
  }

  return safe;
}

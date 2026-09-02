// Санитайзер тела запроса для audit_logs.meta (EXPANSION_TASKS.md §2.2). Два независимых
// механизма поверх обычных значений:
//  - маскирование секретов по подстроке в имени ключа;
//  - allowlist "крупных" полей (content/contentHtml у статей/новостей/кейсов/лендингов,
//    bio/bioHtml у сотрудников) — вместо содержимого кладём сводку {changed, length}, а не сам
//    текст.
// Плюс общий потолок на итоговый сериализованный размер как страховка поверх allowlist —
// решает "широкие, но не глубокие" тела, которые allowlist не предвидел (см. expansion-decisions.md,
// задача 2, п.2.2).
const SECRET_KEY_PATTERN = /password|token|secret|hash|cookie/i;
// "key" — только как окончание имени (apiKey/secretKey), не подстрокой где угодно: подстрокой
// он совпал бы с легитимным полем "keywords" (мета-теги статей/кейсов, code review high) и стёр
// бы реальное значение вместо секрета.
const KEY_SUFFIX_PATTERN = /key$/i;
const LARGE_FIELD_KEYS = new Set(['content', 'contentHtml', 'bio', 'bioHtml']);
const META_SIZE_CAP_BYTES = 12 * 1024;
const OVERSIZED_MARKER = '[oversized]';
// Одна вложенность — тела DTO в проекте плоские, этого достаточно для защиты от секрета,
// случайно завёрнутого в объект-обёртку (например { credentials: { apiKey } }); полная
// рекурсия произвольной глубины сюда не нужна (code review high).
const MAX_NESTING_DEPTH = 1;

function isSecretKeyName(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key) || KEY_SUFFIX_PATTERN.test(key);
}

// Длина уже строкового значения не требует повторного JSON.stringify (экранирование кавычек ему
// не нужно — length используется только как приблизительная оценка объёма).
function serializedLength(value: unknown): number {
  return typeof value === 'string'
    ? value.length
    : JSON.stringify(value ?? null).length;
}

function summarizeLargeField(value: unknown): {
  changed: true;
  length: number;
} {
  return { changed: true, length: serializedLength(value) };
}

// Элемент массива сам может быть объектом-обёрткой секрета ({ employees: [{ name, password }] })
// — раньше массив копировался в audit_logs.meta целиком, в обход маскирования (security-audit-
// 2026-08-31.md, находка №3). Ключ элемента условный ('' — не совпадёт ни с SECRET_KEY_PATTERN,
// ни с LARGE_FIELD_KEYS), поэтому под маскирование попадают только вложенные ключи самого объекта.
function sanitizeArrayItem(item: unknown, depth: number): unknown {
  return typeof item === 'object' && item !== null && !Array.isArray(item)
    ? sanitizeEntries(item as Record<string, unknown>, depth)
    : item;
}

function sanitizeValue(key: string, value: unknown, depth: number): unknown {
  if (isSecretKeyName(key)) return '***';
  if (LARGE_FIELD_KEYS.has(key)) return summarizeLargeField(value);
  if (depth < MAX_NESTING_DEPTH && Array.isArray(value)) {
    return value.map((item) => sanitizeArrayItem(item, depth + 1));
  }
  if (
    depth < MAX_NESTING_DEPTH &&
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  ) {
    return sanitizeEntries(value as Record<string, unknown>, depth + 1);
  }
  return value;
}

function sanitizeEntries(
  body: Record<string, unknown>,
  depth: number,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(body).map(([key, value]) => [
      key,
      sanitizeValue(key, value, depth),
    ]),
  );
}

function entryByteSize(key: string, value: unknown): number {
  return Buffer.byteLength(JSON.stringify({ [key]: value }));
}

export function sanitizeAuditBody(
  body: unknown,
): Record<string, unknown> | undefined {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return undefined;
  }

  const sanitized = sanitizeEntries(body as Record<string, unknown>, 0);
  const entries = Object.entries(sanitized);
  if (entries.length === 0) return {};

  const totalSize = Buffer.byteLength(JSON.stringify(sanitized));
  if (totalSize <= META_SIZE_CAP_BYTES) return sanitized;

  // Потолок сработал — поле не входит в allowlist и оказалось неожиданно большим. Заменяем
  // значения по одному, от самого крупного к самому мелкому (не с конца тела — виновник не
  // обязательно последнее поле в объекте), пока не влезет: мелкие содержательные поля не
  // приносятся в жертву ради крупного, даже если оно идёт в теле первым. Размер каждого поля
  // считается один раз заранее, итоговый счётчик — инкрементально, без повторной сериализации
  // всего объекта на каждой замене.
  const sizes = new Map(
    entries.map(([key, value]) => [key, entryByteSize(key, value)]),
  );
  const bySizeDescending = [...entries].sort(
    ([keyA], [keyB]) => sizes.get(keyB)! - sizes.get(keyA)!,
  );

  const truncated: Record<string, unknown> = {
    ...sanitized,
    __truncated: true,
  };
  let runningSize = totalSize + entryByteSize('__truncated', true);
  for (const [key] of bySizeDescending) {
    if (runningSize <= META_SIZE_CAP_BYTES) break;
    runningSize =
      runningSize - sizes.get(key)! + entryByteSize(key, OVERSIZED_MARKER);
    truncated[key] = OVERSIZED_MARKER;
  }
  return truncated;
}

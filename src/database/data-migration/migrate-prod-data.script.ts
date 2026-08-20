import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { DataSource, EntityManager } from 'typeorm';
import { LeadDeliveryStatus } from '../../modules/clients/enums/lead-delivery-status.enum';
import { UPLOADS_ROOT } from '../../core/uploads.constants';

loadEnv({ quiet: true });

// Одноразовый инструмент этапа 7 (миграция данных на копии прода), не часть рантайма приложения —
// поэтому raw SQL через query(), а не сущности/репозитории: колонки/типы старой и новой схемы
// местами расходятся (см. _docs/rewrite-log.md, сессия про этап 7), сырой SQL даёт явный контроль
// над каждым касто́м без сюрпризов от ORM-хидрации по сегодняшним (не историческим) правилам сущностей.
//
// Источник (SOURCE_DB_*) и цель (TARGET_DB_*) — отдельные явные env-переменные, никогда не
// совпадающие неявно с обычным .env приложения (DB_*), чтобы случайно не перезаписать боевую для
// разработки БД.

interface Queryable {
  query(sql: string, params?: unknown[]): Promise<unknown[]>;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} не задан в окружении`);
  }
  return value;
}

function buildDataSource(prefix: 'SOURCE' | 'TARGET'): DataSource {
  return new DataSource({
    type: 'postgres',
    host: requireEnv(`${prefix}_DB_HOST`),
    port: Number(requireEnv(`${prefix}_DB_PORT`)),
    username: requireEnv(`${prefix}_DB_USER`),
    password: requireEnv(`${prefix}_DB_PASS`),
    database: requireEnv(`${prefix}_DB_NAME`),
    entities: [],
    synchronize: false,
    logging: false,
  });
}

async function bulkInsert(
  target: Queryable,
  table: string,
  columns: string[],
  rows: unknown[][],
): Promise<void> {
  if (rows.length === 0) return;

  const placeholders = rows
    .map(
      (row, i) =>
        `(${row.map((_, j) => `$${i * columns.length + j + 1}`).join(', ')})`,
    )
    .join(', ');
  const params = rows.flat();

  await target.query(
    `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES ${placeholders}`,
    params,
  );
}

// Сбрасывает sequence на max(id) — дальше приложение само продолжает нумерацию без конфликтов
// с явно перенесёнными id.
async function resetSequence(target: Queryable, table: string): Promise<void> {
  await target.query(
    `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), COALESCE((SELECT MAX(id) FROM "${table}"), 1), (SELECT MAX(id) FROM "${table}") IS NOT NULL)`,
  );
}

// node-postgres сериализует JS-массивы как Postgres ARRAY-литерал по умолчанию (в отличие от
// обычных объектов, которые оно само JSON.stringify'ит) — для jsonb-колонок, где реально лежит
// массив (не native text[]/int[]), это ломается на вставке. Явный stringify только для этих трёх
// колонок (employees.same_as, cases.industry, tariffs.billing_cycles).
function jsonbArray(value: unknown): string | null {
  return value === null || value === undefined ? null : JSON.stringify(value);
}

type Row = Record<string, unknown>;

async function migrateEmployees(
  source: Queryable,
  target: Queryable,
): Promise<number> {
  const rows = (await source.query(`
    SELECT id, slug, name, "position", "photoUrl", "shortBio", bio, "bioHtml",
           experience, "sameAs", "metaTitle", "metaDescription", priority,
           "isVisible", "createdAt", "updatedAt"
    FROM employees ORDER BY id
  `)) as Row[];

  const columns = [
    'id',
    'slug',
    'name',
    'position',
    'photo_url',
    'short_bio',
    'bio',
    'bio_html',
    'experience',
    'same_as',
    'meta_title',
    'meta_description',
    'priority',
    'is_visible',
    'created_at',
    'updated_at',
  ];
  const values = rows.map((r) => [
    r.id,
    r.slug,
    r.name,
    r.position,
    r.photoUrl,
    r.shortBio,
    r.bio,
    r.bioHtml,
    r.experience,
    jsonbArray(r.sameAs),
    r.metaTitle,
    r.metaDescription,
    r.priority,
    r.isVisible,
    r.createdAt,
    r.updatedAt,
  ]);
  await bulkInsert(target, 'employees', columns, values);
  return rows.length;
}

async function migrateTags(
  source: Queryable,
  target: Queryable,
): Promise<number> {
  const rows = (await source.query(`
    SELECT id, slug, name, priority, "createdAt", "updatedAt" FROM tags ORDER BY id
  `)) as Row[];

  const columns = [
    'id',
    'slug',
    'name',
    'priority',
    'created_at',
    'updated_at',
  ];
  const values = rows.map((r) => [
    r.id,
    r.slug,
    r.name,
    r.priority,
    r.createdAt,
    r.updatedAt,
  ]);
  await bulkInsert(target, 'tags', columns, values);
  return rows.length;
}

async function migrateIndustries(
  source: Queryable,
  target: Queryable,
): Promise<number> {
  // created_at/updated_at — timestamp БЕЗ timezone на проде, но подтверждённый TimeZone проде —
  // Etc/UTC (SHOW timezone), поэтому AT TIME ZONE 'UTC' корректно переинтерпретирует наивное
  // значение как UTC-момент, не как локальное время сессии.
  const rows = (await source.query(`
    SELECT id, name,
           (created_at AT TIME ZONE 'UTC') AS created_at,
           (updated_at AT TIME ZONE 'UTC') AS updated_at
    FROM industries ORDER BY id
  `)) as Row[];

  const columns = ['id', 'name', 'created_at', 'updated_at'];
  const values = rows.map((r) => [r.id, r.name, r.created_at, r.updated_at]);
  await bulkInsert(target, 'industries', columns, values);
  return rows.length;
}

async function migrateServiceCategories(
  source: Queryable,
  target: Queryable,
): Promise<number> {
  const rows = (await source.query(`
    SELECT id, name, description FROM service_category ORDER BY id
  `)) as Row[];

  const columns = ['id', 'name', 'description'];
  const values = rows.map((r) => [r.id, r.name, r.description]);
  await bulkInsert(target, 'service_category', columns, values);
  return rows.length;
}

async function migrateServices(
  source: Queryable,
  target: Queryable,
): Promise<number> {
  const rows = (await source.query(`
    SELECT id, slug, title, subtitle, description, "subDescription", list, icon,
           "backgroundColor"::text AS "backgroundColor",
           (date_create AT TIME ZONE 'UTC') AS created_at,
           (date_update AT TIME ZONE 'UTC') AS updated_at,
           category_id
    FROM services ORDER BY id
  `)) as Row[];

  const columns = [
    'id',
    'slug',
    'title',
    'subtitle',
    'description',
    'sub_description',
    'list',
    'icon',
    'background_color',
    'created_at',
    'updated_at',
    'category_id',
  ];
  const values = rows.map((r) => [
    r.id,
    r.slug,
    r.title,
    r.subtitle,
    r.description,
    r.subDescription,
    r.list,
    r.icon,
    r.backgroundColor,
    r.created_at,
    r.updated_at,
    r.category_id,
  ]);
  await bulkInsert(target, 'services', columns, values);
  return rows.length;
}

async function migrateServiceSteps(
  source: Queryable,
  target: Queryable,
): Promise<number> {
  const rows = (await source.query(`
    SELECT id, step, title, description, "time", service_id FROM service_steps ORDER BY id
  `)) as Row[];

  const columns = ['id', 'step', 'title', 'description', 'time', 'service_id'];
  const values = rows.map((r) => [
    r.id,
    r.step,
    r.title,
    r.description,
    r.time,
    r.service_id,
  ]);
  await bulkInsert(target, 'service_steps', columns, values);
  return rows.length;
}

async function migrateServiceFaq(
  source: Queryable,
  target: Queryable,
): Promise<number> {
  const rows = (await source.query(`
    SELECT id, service_id, question, answer,
           (date_create AT TIME ZONE 'UTC') AS created_at,
           (date_update AT TIME ZONE 'UTC') AS updated_at
    FROM service_faq ORDER BY id
  `)) as Row[];

  const columns = [
    'id',
    'service_id',
    'question',
    'answer',
    'created_at',
    'updated_at',
  ];
  const values = rows.map((r) => [
    r.id,
    r.service_id,
    r.question,
    r.answer,
    r.created_at,
    r.updated_at,
  ]);
  await bulkInsert(target, 'service_faq', columns, values);
  return rows.length;
}

async function migrateTariffPeriods(
  source: Queryable,
  target: Queryable,
): Promise<number> {
  const rows = (await source.query(`
    SELECT id, months, "discountPercent" FROM tariff_periods ORDER BY id
  `)) as Row[];

  const columns = ['id', 'months', 'discount_percent'];
  const values = rows.map((r) => [r.id, r.months, r.discountPercent]);
  await bulkInsert(target, 'tariff_periods', columns, values);
  return rows.length;
}

async function migrateTariffs(
  source: Queryable,
  target: Queryable,
): Promise<number> {
  const rows = (await source.query(`
    SELECT id, name, "from", features, is_popular, "billingCycles", "basePrice",
           order_index, "serviceId"
    FROM tariffs ORDER BY id
  `)) as Row[];

  const columns = [
    'id',
    'name',
    'from',
    'features',
    'is_popular',
    'billing_cycles',
    'base_price',
    'order_index',
    'service_id',
  ];
  const values = rows.map((r) => [
    r.id,
    r.name,
    r.from,
    r.features,
    r.is_popular,
    jsonbArray(r.billingCycles),
    r.basePrice,
    r.order_index,
    r.serviceId,
  ]);
  await bulkInsert(target, 'tariffs', columns, values);
  return rows.length;
}

async function migrateUsers(
  source: Queryable,
  target: Queryable,
): Promise<number> {
  const rows = (await source.query(`
    SELECT id, username, password, role FROM users ORDER BY id
  `)) as Row[];

  // is_active/created_at/updated_at не было в старой схеме (см. rewrite-log, этап 1/2) —
  // is_active=true, даты — now() на момент переноса, это уже принятый пробел, не гадаем.
  const columns = ['id', 'username', 'password', 'role', 'is_active'];
  const values = rows.map((r) => [r.id, r.username, r.password, r.role, true]);
  await bulkInsert(target, 'users', columns, values);
  return rows.length;
}

// media (было) + image_lib (было) → media (стало), этап 4. Новые id — не переносим старые
// числовые id ни из одной из старых таблиц (они бы конфликтовали друг с другом), но и не
// переименовываем сами файлы: basename уже уникальный UUID в обеих старых таблицах, а имя файла
// упомянуто как текст внутри articles/cases.content (Tiptap JSON) и employees.photo_url — не FK,
// значит переименование молча сломало бы уже опубликованный контент.
async function migrateMedia(
  source: Queryable,
  target: Queryable,
): Promise<number> {
  const mediaRows = (await source.query(`
    SELECT name, "fileName", alt,
           (created_at AT TIME ZONE 'UTC') AS created_at,
           (updated_at AT TIME ZONE 'UTC') AS updated_at
    FROM media ORDER BY id
  `)) as Row[];

  const imageLibRows = (await source.query(`
    SELECT name, link,
           (created_at AT TIME ZONE 'UTC') AS created_at,
           (updated_at AT TIME ZONE 'UTC') AS updated_at
    FROM image_lib ORDER BY id
  `)) as Row[];

  const columns = ['name', 'file_name', 'alt', 'created_at', 'updated_at'];
  const values = [
    ...mediaRows.map((r) => [
      r.name,
      r.fileName,
      r.alt,
      r.created_at,
      r.updated_at,
    ]),
    ...imageLibRows.map((r) => [
      r.name,
      String(r.link).split('/').pop(),
      null,
      r.created_at,
      r.updated_at,
    ]),
  ];
  await bulkInsert(target, 'media', columns, values);
  return values.length;
}

async function fetchImageLibFileNames(source: Queryable): Promise<string[]> {
  const rows = (await source.query(
    `SELECT link FROM image_lib ORDER BY id`,
  )) as Row[];
  return rows
    .map((r) => String(r.link).split('/').pop())
    .filter((name): name is string => Boolean(name));
}

// Две записи image_lib с разными путями, но одинаковым именем файла иначе тихо перезаписывают друг
// друга на диске в copyImageLibFiles (N-3, round-3 review, "смежное" — Promise.all внутри чанка не
// гарантирует, какая копия победит), а UNIQUE(media.file_name) в целевой БД поймает это только
// после того, как один из файлов уже испорчен. Проверяется до единого fs.copyFile.
function findDuplicateBasenames(fileNames: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const name of fileNames) {
    if (seen.has(name)) duplicates.add(name);
    seen.add(name);
  }
  return [...duplicates];
}

// Pre-flight вместо fs.copyFile(..., COPYFILE_EXCL) (N-3, round-3 review): COPYFILE_EXCL в лоб
// ломает документированный повтор ETL (README — при сбое поправить SOURCE_IMAGE_LIB_ROOT/права и
// перезапустить `yarn migrate:prod-data` целиком; после первого успешного прогона файлы уже лежат в
// uploads/media/, EEXIST на повторе выглядел бы как "файла нет" и ушёл бы в missing с ложной
// диагностикой). Пересечение с уже существующими media.file_name в ЦЕЛЕВОЙ БД проверяется явно, до
// того как что-либо тронуто на диске — на пустой целевой БД (нормальный случай, включая повтор
// после отката транзакции) пересечение всегда пусто, и повтор безопасен.
async function findCollidingMediaFileNames(
  target: Queryable,
  fileNames: string[],
): Promise<string[]> {
  if (fileNames.length === 0) return [];
  const rows = (await target.query(
    `SELECT file_name FROM media WHERE file_name = ANY($1)`,
    [fileNames],
  )) as { file_name: string }[];
  return rows.map((r) => r.file_name);
}

// Физическое копирование файлов image-lib → media (решение принято осознанно, не move и не
// symlink: оригиналы на старом сервере не наши, чтобы трогать). basename сохранён (см.
// migrateMedia) — под новые media-записи кладётся копия того же файла в /uploads/media/, откуда
// его строит media-response.dto.ts. migrateArticles/migrateCases переписывают ссылки
// /uploads/image-lib/... на /uploads/media/... в content/contentHtml тем же basename'ом (N2,
// round-2 review — ТЗ §2 требует ОДНУ подсистему медиа, не два постоянно живых каталога), поэтому
// эта копия обязана быть полной ДО записи переписанного контента: вызывается до транзакции в
// run(), падает жёстко, если недостающий файл реально упомянут в опубликованном контенте (см.
// findCriticalMissingFiles ниже — image_lib целиком шире, чем то, что попало в content/contentHtml,
// пропавший неиспользуемый файл не должен блокировать весь перенос). Старый /uploads/image-lib/ на
// новом сервере сознательно не понадобится. Требует локального доступа к каталогу старого прода
// (SOURCE_IMAGE_LIB_ROOT) — SOURCE_DB_HOST может быть удалённым, файлы — нет; обычно это заранее
// синхронизированная копия uploads/image-lib/ с боевого сервера.
const COPY_CONCURRENCY = 20;

async function copyImageLibFiles(
  fileNames: string[],
): Promise<{ copied: number; missing: string[] }> {
  const sourceRoot = requireEnv('SOURCE_IMAGE_LIB_ROOT');
  const targetDir = path.join(UPLOADS_ROOT, 'media');
  await fs.mkdir(targetDir, { recursive: true });

  const missing: string[] = [];
  let copied = 0;

  for (let i = 0; i < fileNames.length; i += COPY_CONCURRENCY) {
    const chunk = fileNames.slice(i, i + COPY_CONCURRENCY);
    await Promise.all(
      chunk.map(async (fileName) => {
        try {
          await fs.copyFile(
            path.join(sourceRoot, fileName),
            path.join(targetDir, fileName),
          );
          copied += 1;
        } catch (error) {
          // Только ENOENT (файла реально нет на source) — не критично само по себе, см.
          // findCriticalMissingFiles ниже (round-3 review: раньше любая ошибка, включая EACCES/
          // ENOSPC, молча классифицировалась как "файла нет" — при ENOSPC на приёмнике мог остаться
          // обрезанный файл, а скрипт вместо явного сбоя писал бы про несуществующий source).
          // Остальное — реальная операционная проблема, не "нет файла": роняем весь перенос сразу.
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          missing.push(fileName);
        }
      }),
    );
  }

  return { copied, missing };
}

const IMAGE_LIB_URL_PREFIX = '/uploads/image-lib/';
const MEDIA_URL_PREFIX = '/uploads/media/';

// basename не меняется при копировании (см. copyImageLibFiles выше) — прямая замена префикса пути
// корректна для любого файла оттуда, без карты старое/новое имя. Работает и на объектах (Tiptap
// JSON в content — сериализуем/десериализуем вокруг replace, не обходим дерево вручную, не завязано
// на схему Tiptap), и на HTML-строке (content_html) через одну и ту же функцию.
function rewriteImageLibRefs<T>(value: T): T {
  if (value === null || value === undefined) return value;
  const isString = typeof value === 'string';
  const text = isString ? (value as string) : JSON.stringify(value);
  if (!text.includes(IMAGE_LIB_URL_PREFIX)) return value;
  const rewritten = text.replaceAll(IMAGE_LIB_URL_PREFIX, MEDIA_URL_PREFIX);
  return (isString ? rewritten : JSON.parse(rewritten)) as T;
}

async function countImageLibReferences(target: Queryable): Promise<number> {
  const rows = (await target.query(
    `
    SELECT
      (SELECT count(*) FROM articles WHERE content::text LIKE $1 OR content_html LIKE $1)
      + (SELECT count(*) FROM cases WHERE content::text LIKE $1 OR content_html LIKE $1)
      AS count
  `,
    [`%${IMAGE_LIB_URL_PREFIX}%`],
  )) as { count: string }[];
  return Number(rows[0]?.count ?? 0);
}

// Только файлы, реально упомянутые в опубликованном контенте, критичны для переноса (N2, round-2
// review: fetchImageLibFileNames тянет ВСЮ таблицу image_lib, включая записи, на которые ни одна
// статья/кейс не ссылается — такой файл, если пропал на диске, портит только карточку в медиатеке,
// не паблик). Дешёвая проверка post-hoc: если что-то не скопировалось, смотрим, встречается ли
// имя файла хоть где-то в контенте источника, и останавливаем перенос только из-за таких.
async function findCriticalMissingFiles(
  source: Queryable,
  missing: string[],
): Promise<string[]> {
  if (missing.length === 0) return [];
  // COALESCE и на content — не только на contentHtml (round-3 review): articles.content NOT NULL,
  // но cases.content jsonb nullable (в отличие от articles). Без COALESCE конкатенация с NULL даёт
  // NULL на всю строку, string_agg такую строку молча пропускает — кейс с картинкой только в
  // content_html (content ещё не заполнен) выпадал бы из проверки критичности целиком.
  const rows = (await source.query(`
    SELECT
      string_agg(COALESCE(content::text, '') || ' ' || COALESCE("contentHtml", ''), ' ') AS articles_text,
      (SELECT string_agg(COALESCE(content::text, '') || ' ' || COALESCE("contentHtml", ''), ' ') FROM cases) AS cases_text
    FROM articles
  `)) as { articles_text: string | null; cases_text: string | null }[];
  const combined = `${rows[0]?.articles_text ?? ''} ${rows[0]?.cases_text ?? ''}`;
  return missing.filter((fileName) => combined.includes(fileName));
}

async function migrateArticles(
  source: Queryable,
  target: Queryable,
): Promise<number> {
  const rows = (await source.query(`
    SELECT id, slug, title, description, content, "contentHtml", "metaTitle",
           "metaDescription", keywords, date_published, priority, "readingTime",
           "hasToc", "createdAt", "updatedAt"
    FROM articles ORDER BY id
  `)) as Row[];

  const columns = [
    'id',
    'slug',
    'title',
    'description',
    'content',
    'content_html',
    'meta_title',
    'meta_description',
    'keywords',
    'date_published',
    'priority',
    'reading_time',
    'has_toc',
    'created_at',
    'updated_at',
  ];
  const values = rows.map((r) => [
    r.id,
    r.slug,
    r.title,
    r.description,
    rewriteImageLibRefs(r.content),
    rewriteImageLibRefs(r.contentHtml),
    r.metaTitle,
    r.metaDescription,
    r.keywords,
    r.date_published,
    r.priority,
    r.readingTime,
    r.hasToc,
    r.createdAt,
    r.updatedAt,
  ]);
  await bulkInsert(target, 'articles', columns, values);
  return rows.length;
}

async function migrateCases(
  source: Queryable,
  target: Queryable,
): Promise<number> {
  const rows = (await source.query(`
    SELECT id, title, description, problem, result, content, "metaTitle",
           "metaDescription", keywords, industry, slug, "contentHtml",
           date_published, priority, "hasToc",
           (created_at AT TIME ZONE 'UTC') AS created_at,
           (updated_at AT TIME ZONE 'UTC') AS updated_at
    FROM cases ORDER BY id
  `)) as Row[];

  const columns = [
    'id',
    'industry',
    'slug',
    'title',
    'description',
    'problem',
    'result',
    'content',
    'content_html',
    'meta_title',
    'meta_description',
    'keywords',
    'date_published',
    'priority',
    'has_toc',
    'created_at',
    'updated_at',
  ];
  const values = rows.map((r) => [
    r.id,
    jsonbArray(r.industry),
    r.slug,
    r.title,
    r.description,
    r.problem,
    r.result,
    rewriteImageLibRefs(r.content),
    rewriteImageLibRefs(r.contentHtml),
    r.metaTitle,
    r.metaDescription,
    r.keywords,
    r.date_published,
    r.priority,
    r.hasToc,
    r.created_at,
    r.updated_at,
  ]);
  await bulkInsert(target, 'cases', columns, values);
  return rows.length;
}

async function migrateArticleFaq(
  source: Queryable,
  target: Queryable,
): Promise<number> {
  const rows = (await source.query(`
    SELECT id, article_id, question, answer, date_create, date_update
    FROM article_faq ORDER BY id
  `)) as Row[];

  const columns = [
    'id',
    'article_id',
    'question',
    'answer',
    'created_at',
    'updated_at',
  ];
  const values = rows.map((r) => [
    r.id,
    r.article_id,
    r.question,
    r.answer,
    r.date_create,
    r.date_update,
  ]);
  await bulkInsert(target, 'article_faq', columns, values);
  return rows.length;
}

async function migrateCaseFaq(
  source: Queryable,
  target: Queryable,
): Promise<number> {
  const rows = (await source.query(`
    SELECT id, case_id, question, answer, date_create, date_update
    FROM case_faq ORDER BY id
  `)) as Row[];

  const columns = [
    'id',
    'case_id',
    'question',
    'answer',
    'created_at',
    'updated_at',
  ];
  const values = rows.map((r) => [
    r.id,
    r.case_id,
    r.question,
    r.answer,
    r.date_create,
    r.date_update,
  ]);
  await bulkInsert(target, 'case_faq', columns, values);
  return rows.length;
}

async function migrateJoinTable(
  source: Queryable,
  target: Queryable,
  table: string,
  columns: [string, string],
): Promise<number> {
  const rows = (await source.query(
    `SELECT "${columns[0]}", "${columns[1]}" FROM "${table}"`,
  )) as Row[];
  const values = rows.map((r) => [r[columns[0]], r[columns[1]]]);
  await bulkInsert(target, table, columns, values);
  return rows.length;
}

// clients.merged_into_client_id — self-FK, в 2 прохода: сперва все строки с NULL здесь, потом
// UPDATE для тех, у кого в проде реально было значение (иначе вставка упадёт на ссылке на ещё не
// существующую строку, если объединённый дубль имеет больший id, чем главная запись).
async function migrateClients(
  source: Queryable,
  target: Queryable,
): Promise<number> {
  const rows = (await source.query(`
    SELECT id, name, primary_phone, primary_email, leads_count, last_lead_at,
           is_merged, merged_into_client_id, created_at, updated_at
    FROM clients ORDER BY id
  `)) as Row[];

  const columns = [
    'id',
    'name',
    'primary_phone',
    'primary_email',
    'leads_count',
    'last_lead_at',
    'is_merged',
    'merged_into_client_id',
    'created_at',
    'updated_at',
  ];
  const values = rows.map((r) => [
    r.id,
    r.name,
    r.primary_phone,
    r.primary_email,
    r.leads_count,
    r.last_lead_at,
    r.is_merged,
    null,
    r.created_at,
    r.updated_at,
  ]);
  await bulkInsert(target, 'clients', columns, values);

  const merged = rows.filter((r) => r.merged_into_client_id !== null);
  for (const r of merged) {
    await target.query(
      `UPDATE "clients" SET "merged_into_client_id" = $1 WHERE "id" = $2`,
      [r.merged_into_client_id, r.id],
    );
  }
  return rows.length;
}

async function migrateClientContacts(
  source: Queryable,
  target: Queryable,
): Promise<number> {
  const rows = (await source.query(`
    SELECT id, client_id, type, value, is_primary, created_at
    FROM client_contacts ORDER BY id
  `)) as Row[];

  const columns = [
    'id',
    'client_id',
    'type',
    'value',
    'is_primary',
    'created_at',
  ];
  const values = rows.map((r) => [
    r.id,
    r.client_id,
    r.type,
    r.value,
    r.is_primary,
    r.created_at,
  ]);
  await bulkInsert(target, 'client_contacts', columns, values);
  return rows.length;
}

// Статус по факту наличия bitrix_lead_id, не безусловный 'sent' (N5, round-2 review): на дампе от
// 18.07 у всех 49 лидов он был (реально доставлены), но это инвариант конкретного дампа на
// конкретную дату, не гарантия — к моменту боевого прогона могла появиться недоставленная заявка,
// и безусловный 'sent' навсегда скрыл бы её от LeadDeliveryScheduler. С другой стороны, 'sent' для
// реально доставленных остаётся обязательным: дефолт 'pending' для них заставил бы шедулер
// повторно отправить уже доставленные лиды в Bitrix и задвоить их в CRM.
//
// bitrix_lead_id IS NULL → FAILED, не 'pending' (N-8, round-3 review). По коду старого бека
// (backend/src/modules/client/services/client-lead.service.ts) NULL означает, что лид реально НЕ
// дошёл до Bitrix (HTTP 200 с телом {"error":...} не бросает axios-исключение — строка сохраняется,
// bitrix_lead_id просто не заполняется) — но статус FAILED корректен при любом прочтении NULL:
// 'pending' с next_retry_at = NULL подхватывается первой же веткой findDueForDelivery без отсечения
// по created_at и улетает в Bitrix в первую же минуту после старта приложения — полугодовая заявка
// появляется в CRM как новая, независимо от того, что на самом деле означает NULL. FAILED не
// подбирается findDueForDelivery, но виден в админке и ручной retry работает — решение отправлять
// такие лиды принимает человек, не автоматика сразу после ETL.
async function migrateClientLeads(
  source: Queryable,
  target: Queryable,
): Promise<number> {
  const rows = (await source.query(`
    SELECT id, client_id, external_system, type, name, phone_raw, phone_normalized,
           email_raw, email_normalized, message, comment, utm, payload,
           bitrix_payload, bitrix_lead_id, bitrix_response, created_at
    FROM client_leads ORDER BY id
  `)) as Row[];

  const columns = [
    'id',
    'client_id',
    'external_system',
    'type',
    'name',
    'phone_raw',
    'phone_normalized',
    'email_raw',
    'email_normalized',
    'message',
    'comment',
    'utm',
    'payload',
    'bitrix_payload',
    'bitrix_lead_id',
    'bitrix_response',
    'created_at',
    'status',
    'retry_count',
  ];
  const values = rows.map((r) => [
    r.id,
    r.client_id,
    r.external_system,
    r.type,
    r.name,
    r.phone_raw,
    r.phone_normalized,
    r.email_raw,
    r.email_normalized,
    r.message,
    r.comment,
    r.utm,
    r.payload,
    r.bitrix_payload,
    r.bitrix_lead_id,
    r.bitrix_response,
    r.created_at,
    // != null, не truthy-проверка (round-3 review): bitrix_lead_id — строка id из Bitrix, falsy-
    // проверка ошибочно дала бы FAILED для гипотетического (пусть и маловероятного) id '0'.
    r.bitrix_lead_id != null
      ? LeadDeliveryStatus.SENT
      : LeadDeliveryStatus.FAILED,
    0,
  ]);
  await bulkInsert(target, 'client_leads', columns, values);

  // Печатаем id и bitrix_response каждого такого лида (N-8, round-3 review) — по наличию в нём
  // "error" видно, какая из интерпретаций NULL верна для конкретной строки, и человек, а не
  // LeadDeliveryScheduler, решает, отправлять ли её в Bitrix вручную из админки.
  const failedRows = rows.filter((r) => r.bitrix_lead_id == null);
  if (failedRows.length > 0) {
    console.warn(
      `${failedRows.length}/${rows.length} лидов без bitrix_lead_id перенесены как 'failed' — ` +
        `LeadDeliveryScheduler их НЕ подхватит автоматически, ручной retry из админки доступен. ` +
        `Разобрать вручную по bitrix_response, действительно ли не доставлены:`,
    );
    for (const r of failedRows) {
      console.warn(
        `  id=${String(r.id)}: bitrix_response=${JSON.stringify(r.bitrix_response)}`,
      );
    }
  }

  return rows.length;
}

async function run(): Promise<void> {
  const source = buildDataSource('SOURCE');
  const target = buildDataSource('TARGET');

  await source.initialize();
  await target.initialize();

  try {
    // До транзакции и обязательно успешное (N2, round-2 review): migrateArticles/migrateCases
    // переписывают ссылки в контенте на /uploads/media/..., значит копия должна долететь раньше,
    // чем БД получит переписанный текст, иначе опубликованные статьи получат 404 на картинки.
    const imageLibFileNames = await fetchImageLibFileNames(source);

    const duplicateBasenames = findDuplicateBasenames(imageLibFileNames);
    if (duplicateBasenames.length > 0) {
      throw new Error(
        `image_lib содержит записи с разными путями, но одинаковым именем файла — перенос ` +
          `остановлен до копирования, диск и БД не тронуты: ${duplicateBasenames.join(', ')}`,
      );
    }

    const collidingFileNames = await findCollidingMediaFileNames(
      target,
      imageLibFileNames,
    );
    if (collidingFileNames.length > 0) {
      throw new Error(
        `В целевой media уже есть файлы с такими же именами — перенос остановлен до копирования, ` +
          `чтобы не перезаписать существующие: ${collidingFileNames.join(', ')}`,
      );
    }

    const { copied, missing } = await copyImageLibFiles(imageLibFileNames);
    console.log(
      `Файлы image-lib: скопировано ${copied}/${imageLibFileNames.length} в uploads/media/.`,
    );
    if (missing.length > 0) {
      const critical = await findCriticalMissingFiles(source, missing);
      if (critical.length > 0) {
        throw new Error(
          `Не найдены файлы, на которые ссылается опубликованный контент (перенос остановлен, ` +
            `БД не тронута): ${critical.join(', ')}`,
        );
      }
      console.warn(
        `Не найдены на диске в SOURCE_IMAGE_LIB_ROOT (в контенте не используются, только ` +
          `медиатека — не критично, продолжаю): ${missing.join(', ')}`,
      );
    }

    await target.transaction(async (manager: EntityManager) => {
      const report: Record<string, number> = {};

      report.employees = await migrateEmployees(source, manager);
      report.tags = await migrateTags(source, manager);
      report.industries = await migrateIndustries(source, manager);
      report.service_category = await migrateServiceCategories(source, manager);
      report.services = await migrateServices(source, manager);
      report.service_steps = await migrateServiceSteps(source, manager);
      report.service_faq = await migrateServiceFaq(source, manager);
      report.tariff_periods = await migrateTariffPeriods(source, manager);
      report.tariffs = await migrateTariffs(source, manager);
      report.users = await migrateUsers(source, manager);
      report.media = await migrateMedia(source, manager);
      report.articles = await migrateArticles(source, manager);
      report.cases = await migrateCases(source, manager);
      report.article_faq = await migrateArticleFaq(source, manager);
      report.case_faq = await migrateCaseFaq(source, manager);
      report.article_authors = await migrateJoinTable(
        source,
        manager,
        'article_authors',
        ['article_id', 'employee_id'],
      );
      report.article_tags = await migrateJoinTable(
        source,
        manager,
        'article_tags',
        ['article_id', 'tag_id'],
      );
      report.case_authors = await migrateJoinTable(
        source,
        manager,
        'case_authors',
        ['case_id', 'employee_id'],
      );
      report.case_tags = await migrateJoinTable(source, manager, 'case_tags', [
        'case_id',
        'tag_id',
      ]);
      report.service_to_case = await migrateJoinTable(
        source,
        manager,
        'service_to_case',
        ['case_id', 'service_id'],
      );
      report.clients = await migrateClients(source, manager);
      report.client_contacts = await migrateClientContacts(source, manager);
      report.client_leads = await migrateClientLeads(source, manager);

      for (const table of [
        'employees',
        'tags',
        'industries',
        'service_category',
        'services',
        'service_steps',
        'service_faq',
        'tariff_periods',
        'tariffs',
        'users',
        'articles',
        'cases',
        'article_faq',
        'case_faq',
        'clients',
        'client_contacts',
        'client_leads',
      ]) {
        await resetSequence(manager, table);
      }

      console.table(report);
    });

    console.log('Миграция данных завершена успешно.');

    const leftoverRefs = await countImageLibReferences(target);
    if (leftoverRefs > 0) {
      console.warn(
        `${leftoverRefs} строк в articles/cases всё ещё ссылаются на /uploads/image-lib/ после ` +
          `rewrite — проверить вручную (ожидается 0).`,
      );
    }
  } finally {
    await source.destroy();
    await target.destroy();
  }
}

run().catch((error: unknown) => {
  console.error('Миграция данных не выполнена, транзакция откачена:', error);
  process.exitCode = 1;
});

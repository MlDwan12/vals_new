import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';

loadEnv({ quiet: true });

/**
 * Перенос меты услуг из кода сайта в базу (срез E.2).
 *
 * До среза E мета 18 услуг жила в `front/src/views/service/config/services/*.seo.ts` и правилась
 * только разработчиком. Скрипт забирает оттуда title, description и keywords и кладёт их в
 * `services`, откуда их дальше читает и сайт (E.3), и панель (E.1).
 *
 * Режимы те же, что у `regenerate-content-html.script.ts`:
 *   `--report` (по умолчанию) — ничего не пишет, показывает по каждой услуге, что лежит в базе и
 *     что приедет из файла.
 *   `--apply` — записывает.
 *
 * Отчёт обязателен: это SEO-тексты живого сайта, и потерянный или подменённый title — прямая
 * просадка позиций, которую не видно ни в одном тесте.
 *
 * Чего скрипт не делает:
 *   - не трогает `h1` — в `*.seo.ts` его нет вовсе, заголовок страницы лежит в `*.data.tsx`
 *     (`hero.title`) и остаётся в коде; пустой `h1` в базе означает «берём из кода» (E.3);
 *   - не переписывает непустые поля без `--overwrite`: после E.1 мету уже можно править из
 *     панели, и молча затирать ручную правку файлом из репозитория нельзя.
 */

const SEO_SOURCE_DEFAULT = path.resolve(
  __dirname,
  '../../../../front/src/views/service/config/services',
);

// Значение из front/src/shared/config/company.ts — единственная подстановка, которая встречается
// в TITLE и DESCRIPTION. Всё остальное (${URL_SITE_PROD}, ${PATH_PAGE}) живёт в JSON-LD, а он в
// базу не переносится и остаётся в `*.seo.ts`.
const SITE_NAME = 'ВАЛС';

interface FileMeta {
  slug: string;
  file: string;
  metaTitle: string;
  metaDescription: string;
  keywords: string;
}

interface DbRow {
  id: number;
  slug: string;
  meta_title: string | null;
  meta_description: string | null;
  keywords: string | null;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} не задан в окружении`);
  return value;
}

/** Значение шаблонного литерала: `const TITLE = ` … ``. Литералы в этих файлах однострочные. */
function readTemplateConst(source: string, name: string, file: string): string {
  const match = source.match(new RegExp(`const ${name} =\\s*\`([\\s\\S]*?)\``));
  if (!match) {
    throw new Error(`${file}: не найдена константа ${name}`);
  }

  const raw = match[1].replace(/\$\{SITE_NAME\}/g, SITE_NAME);

  // Неизвестная подстановка дошла бы до базы строкой «${…}» и попала бы в выдачу поисковика —
  // лучше упасть здесь.
  if (raw.includes('${')) {
    throw new Error(
      `${file}: в ${name} осталась неизвестная подстановка — ${raw.slice(raw.indexOf('${'), raw.indexOf('${') + 40)}`,
    );
  }

  return raw.replace(/\s*\n\s*/g, ' ').trim();
}

/** `const KEYWORDS = [ '…', '…' ]` → строка через запятую, в том же виде, что у статей. */
function readKeywords(source: string, file: string): string {
  const block = source.match(/const KEYWORDS = \[([\s\S]*?)\];/);
  if (!block) {
    throw new Error(`${file}: не найден массив KEYWORDS`);
  }

  const keywords = [...block[1].matchAll(/'([^']*)'/g)].map((m) => m[1].trim());
  if (keywords.length === 0) {
    throw new Error(`${file}: массив KEYWORDS пуст`);
  }

  return keywords.join(', ');
}

function readSourceDir(dir: string): FileMeta[] {
  if (!fs.existsSync(dir)) {
    throw new Error(
      `Каталог с мета-файлами сайта не найден: ${dir}\n` +
        'Если репозиторий front лежит не рядом — передайте путь: --source=<путь>',
    );
  }

  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith('.seo.ts'))
    .sort()
    .map((file) => {
      const source = fs.readFileSync(path.join(dir, file), 'utf8');
      return {
        slug: file.replace(/\.seo\.ts$/, ''),
        file,
        metaTitle: readTemplateConst(source, 'TITLE', file),
        metaDescription: readTemplateConst(source, 'DESCRIPTION', file),
        keywords: readKeywords(source, file),
      };
    });
}

function describeCurrent(value: string | null): string {
  return value === null ? 'пусто' : `«${value}»`;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const overwrite = process.argv.includes('--overwrite');
  const sourceArg = process.argv.find((arg) => arg.startsWith('--source='));
  const sourceDir = sourceArg
    ? path.resolve(sourceArg.slice('--source='.length))
    : SEO_SOURCE_DEFAULT;

  const fileMeta = readSourceDir(sourceDir);
  console.log(`Мета-файлы сайта: ${sourceDir}`);
  console.log(`Найдено файлов:          ${fileMeta.length}`);

  const dataSource = new DataSource({
    type: 'postgres',
    host: requireEnv('DB_HOST'),
    port: Number(requireEnv('DB_PORT')),
    username: requireEnv('DB_USER'),
    password: requireEnv('DB_PASS'),
    database: requireEnv('DB_NAME'),
    entities: [],
    synchronize: false,
    logging: false,
  });

  await dataSource.initialize();

  let updated = 0;
  let identical = 0;
  const occupied: string[] = [];
  const missingInDb: string[] = [];

  try {
    const rows: DbRow[] = await dataSource.query(
      'SELECT id, slug, meta_title, meta_description, keywords FROM services ORDER BY slug',
    );
    const bySlug = new Map(rows.map((row) => [row.slug, row]));
    console.log(`Услуг в базе:            ${rows.length}`);

    const withoutFile = rows
      .filter((row) => !fileMeta.some((meta) => meta.slug === row.slug))
      .map((row) => row.slug);

    for (const meta of fileMeta) {
      const row = bySlug.get(meta.slug);

      if (!row) {
        missingInDb.push(meta.slug);
        continue;
      }

      const same =
        row.meta_title === meta.metaTitle &&
        row.meta_description === meta.metaDescription &&
        row.keywords === meta.keywords;

      if (same) {
        identical += 1;
        continue;
      }

      const hasOwnMeta =
        row.meta_title !== null ||
        row.meta_description !== null ||
        row.keywords !== null;

      if (hasOwnMeta && !overwrite) {
        occupied.push(meta.slug);
        console.log('');
        console.log(`  ⚠ ${meta.slug} — в базе уже есть своя мета, пропущено`);
        console.log(`    в базе:  ${describeCurrent(row.meta_title)}`);
        console.log(`    в файле: «${meta.metaTitle}»`);
        continue;
      }

      console.log('');
      console.log(`  ${meta.slug}`);
      console.log(
        `    title (${meta.metaTitle.length}):       ${describeCurrent(row.meta_title)} → «${meta.metaTitle}»`,
      );
      console.log(
        `    description (${meta.metaDescription.length}): ${describeCurrent(row.meta_description)} → «${meta.metaDescription}»`,
      );
      console.log(
        `    keywords (${meta.keywords.split(',').length}):    ${describeCurrent(row.keywords)} → «${meta.keywords}»`,
      );

      if (apply) {
        await dataSource.query(
          `UPDATE services
           SET meta_title = $1, meta_description = $2, keywords = $3
           WHERE id = $4`,
          [meta.metaTitle, meta.metaDescription, meta.keywords, row.id],
        );
        updated += 1;
      }
    }

    console.log('');
    console.log(`Совпадает с базой:       ${identical}`);
    console.log(
      `${apply ? 'Записано:                ' : 'К записи:                '}${apply ? updated : fileMeta.length - identical - occupied.length - missingInDb.length}`,
    );
    console.log(`Своя мета, пропущено:    ${occupied.length}`);
    console.log(`Файл есть, услуги нет:   ${missingInDb.length}`);
    console.log(`Услуга есть, файла нет:  ${withoutFile.length}`);

    if (missingInDb.length > 0) {
      console.log('');
      console.log(`  Нет в базе: ${missingInDb.join(', ')}`);
    }
    if (withoutFile.length > 0) {
      console.log('');
      console.log(`  Нет файла: ${withoutFile.join(', ')}`);
    }
    if (occupied.length > 0) {
      console.log('');
      console.log(
        `  Мету правили из панели: ${occupied.join(', ')} — перезапись только с --overwrite`,
      );
    }
  } finally {
    await dataSource.destroy();
  }

  console.log('');
  console.log(
    'h1 не переносится: в *.seo.ts его нет, заголовок остаётся в *.data.tsx.',
  );

  if (!apply) {
    console.log('');
    console.log('Это отчёт, база не менялась. Запись: --apply');
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});

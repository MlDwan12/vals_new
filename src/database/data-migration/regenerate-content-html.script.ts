import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { renderContentHtml } from '../../core/content/content-html.util';

loadEnv({ quiet: true });

/**
 * Сверка и перегенерация сохранённого HTML материалов (срез X).
 *
 * Запускается в двух режимах:
 *   `--report` (по умолчанию) — ничего не пишет, только считает, в скольких материалах
 *     HTML, собранный беком, отличается от сохранённого, и показывает примеры расхождений.
 *   `--apply` — перезаписывает HTML тем, что собрал бек.
 *
 * Отчёт обязателен перед записью: HTML собирался в браузере (админка), а бек собирает его
 * серверной сборкой tiptap на своём DOM — совпадение до байта нужно доказать на реальном архиве,
 * а не предполагать.
 */

interface Target {
  table: string;
  jsonColumn: string;
  htmlColumn: string;
  titleColumn: string;
}

const TARGETS: Target[] = [
  {
    table: 'articles',
    jsonColumn: 'content',
    htmlColumn: 'content_html',
    titleColumn: 'title',
  },
  {
    table: 'cases',
    jsonColumn: 'content',
    htmlColumn: 'content_html',
    titleColumn: 'title',
  },
  {
    table: 'news',
    jsonColumn: 'content',
    htmlColumn: 'content_html',
    titleColumn: 'title',
  },
  {
    table: 'landings',
    jsonColumn: 'content',
    htmlColumn: 'content_html',
    titleColumn: 'title',
  },
  {
    table: 'employees',
    jsonColumn: 'bio',
    htmlColumn: 'bio_html',
    titleColumn: 'name',
  },
];

interface Row {
  id: number;
  title: string | null;
  json: unknown;
  html: string | null;
}

interface Diff {
  table: string;
  id: number;
  title: string | null;
  stored: string;
  rebuilt: string;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} не задан в окружении`);
  return value;
}

/** Первое расхождение с небольшим контекстом — читать целиком две простыни бессмысленно. */
function firstDifference(a: string, b: string): string {
  const limit = Math.min(a.length, b.length);
  let i = 0;
  while (i < limit && a[i] === b[i]) i += 1;

  const from = Math.max(0, i - 60);
  return [
    `    позиция ${i} из ${a.length} (в базе) / ${b.length} (собрано)`,
    `    в базе:  …${a.slice(from, i + 60)}…`,
    `    собрано: …${b.slice(from, i + 60)}…`,
  ].join('\n');
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');

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

  const diffs: Diff[] = [];
  let total = 0;
  let same = 0;
  let failed = 0;
  let skipped = 0;
  let updated = 0;

  try {
    for (const target of TARGETS) {
      const rows: Row[] = await dataSource.query(
        `SELECT id, ${target.titleColumn} AS title, ${target.jsonColumn} AS json, ${target.htmlColumn} AS html
         FROM ${target.table} ORDER BY id`,
      );

      for (const row of rows) {
        total += 1;

        if (row.json === null || row.json === undefined) {
          // Материал без исходника — единственный случай, когда перегенерация невозможна и
          // сохранённый HTML остаётся единственным источником. Трогать его нельзя.
          skipped += 1;
          continue;
        }

        let rebuilt: string;
        try {
          rebuilt = renderContentHtml(row.json);
        } catch (error) {
          failed += 1;
          console.log(
            `  ✗ ${target.table} #${row.id} «${row.title ?? '—'}»: генерация упала — ${(error as Error).message}`,
          );
          continue;
        }

        if (rebuilt === (row.html ?? '')) {
          same += 1;
          continue;
        }

        diffs.push({
          table: target.table,
          id: row.id,
          title: row.title,
          stored: row.html ?? '',
          rebuilt,
        });

        if (apply) {
          await dataSource.query(
            `UPDATE ${target.table} SET ${target.htmlColumn} = $1 WHERE id = $2`,
            [rebuilt, row.id],
          );
          updated += 1;
        }
      }
    }
  } finally {
    await dataSource.destroy();
  }

  console.log('');
  console.log(`Всего материалов:        ${total}`);
  console.log(`Совпало побайтово:       ${same}`);
  console.log(`Отличается:              ${diffs.length}`);
  console.log(`Без исходного JSON:      ${skipped}`);
  console.log(`Генерация упала:         ${failed}`);
  if (apply) console.log(`Перезаписано:            ${updated}`);

  if (diffs.length > 0) {
    console.log('');
    console.log('Расхождения:');
    for (const diff of diffs.slice(0, 10)) {
      console.log(`  ${diff.table} #${diff.id} «${diff.title ?? '—'}»`);
      console.log(firstDifference(diff.stored, diff.rebuilt));
    }
    if (diffs.length > 10) {
      console.log(`  …и ещё ${diffs.length - 10}`);
    }
  }

  if (!apply) {
    console.log('');
    console.log('Это отчёт, база не менялась. Запись: --apply');
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});

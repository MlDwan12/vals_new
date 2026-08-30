import 'reflect-metadata';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import dataSource from '../../data-source';
import { UPLOADS_ROOT } from '../../core/uploads.constants';
import { Media } from '../../modules/media/domain/media.entity';
import {
  detectImageFormat,
  mimeTypeForFormat,
  parseImageDimensions,
} from '../../modules/media/util/media-dimensions.util';

// Разовый инструмент задачи 4 (EXPANSION_TASKS.md) — заполняет width/height/mimeType/sizeBytes у
// файлов медиатеки, загруженных до появления этих колонок. Не часть рантайма приложения, поэтому
// отдельный скрипт (yarn backfill:media-dimensions), не миграция: миграция схемы не должна зависеть
// от файлов на диске, а на новом окружении (например, чистый деплой) их и не будет.
//
// Парсер — свой, без сторонних библиотек, прогнан против всех 16 реальных файлов проекта на момент
// написания (0 расхождений с `file`/`identify`) — см. _docs/expansion-decisions.md §4.1.
async function main(): Promise<void> {
  await dataSource.initialize();
  const mediaRepo = dataSource.getRepository(Media);

  const pending = await mediaRepo
    .createQueryBuilder('media')
    .where('media.width IS NULL')
    .getMany();

  let updated = 0;
  let skipped = 0;

  for (const media of pending) {
    const filePath = path.join(UPLOADS_ROOT, 'media', media.fileName);
    let buffer: Buffer;
    try {
      buffer = await fs.readFile(filePath);
    } catch {
      console.warn(
        `[skip] файл не найден на диске: ${media.fileName} (id=${media.id})`,
      );
      skipped += 1;
      continue;
    }

    const format = detectImageFormat(buffer);
    const dimensions = parseImageDimensions(buffer);
    if (!format || !dimensions) {
      console.warn(
        `[skip] не удалось разобрать заголовок: ${media.fileName} (id=${media.id})`,
      );
      skipped += 1;
      continue;
    }

    await mediaRepo.update(media.id, {
      width: dimensions.width,
      height: dimensions.height,
      mimeType: mimeTypeForFormat(format),
      sizeBytes: buffer.length,
    });
    console.log(
      `[ok] ${media.fileName} → ${dimensions.width}x${dimensions.height}, ${mimeTypeForFormat(format)}, ${buffer.length} B`,
    );
    updated += 1;
  }

  console.log(
    `Готово: обновлено ${updated}, пропущено ${skipped} из ${pending.length}.`,
  );

  await dataSource.destroy();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

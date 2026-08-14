export const MAX_SINGLE_FILE_BYTES = 1 * 1024 * 1024;
const TOTAL_UPLOAD_BUDGET_BYTES = 10 * 1024 * 1024;

// Общий бюджет на запрос делится поровну между файлами, но не выше потолка на один файл —
// 1 файл получает весь потолок (1 МБ), 10 файлов — по 1 МБ (бюджет как раз на них рассчитан),
// а если бы файлов было больше 10, бюджет ограничил бы каждый сильнее многофайлового потолка multer.
export function maxFileSizeBytes(fileCount: number): number {
  return Math.min(
    MAX_SINGLE_FILE_BYTES,
    Math.floor(TOTAL_UPLOAD_BUDGET_BYTES / fileCount),
  );
}

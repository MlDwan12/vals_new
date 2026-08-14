import { join } from 'node:path';

// Единая точка правды для корня загруженных файлов — используется и раздачей статики
// (app.module.ts), и модулями, которые пишут файлы на диск (сейчас только media).
export const UPLOADS_ROOT = join(process.cwd(), 'uploads');

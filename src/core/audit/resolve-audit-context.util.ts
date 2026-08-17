import { Request } from 'express';

// Мутирующие методы — общий критерий и для AuditInterceptor (что аудировать при успехе), и для
// HttpExceptionFilter (что аудировать при ошибке), не два независимых литерала.
export const MUTATION_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

// Пути вида /admin/<resource>/<id> — не /<resource>/<id>, как в старом коде — первый сегмент
// 'admin' сам по себе не ресурс, пропускаем его при разборе.
export function resolveAuditResource(path: string): {
  resource: string;
  resourceId: number | null;
} {
  const segments = path.replace(/^\//, '').split('/').filter(Boolean);
  const relevant = segments[0] === 'admin' ? segments.slice(1) : segments;
  const resource = relevant[0] || 'unknown';
  const second = relevant[1];
  const resourceId = second && /^\d+$/.test(second) ? Number(second) : null;
  return { resource, resourceId };
}

export function resolveClientIp(request: Request): string | null {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return request.ip ?? null;
}

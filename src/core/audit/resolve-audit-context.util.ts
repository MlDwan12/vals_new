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

const IP_MAX_LENGTH = 64; // audit_logs.ip — varchar(64)

// request.ip — не первый элемент X-Forwarded-For руками (клиент полностью контролирует этот
// заголовок и мог одной ротацией отключить аудит своих же действий — H9). С trust proxy,
// настроенным в main.ts (H3), Express сам корректно достаёт IP клиента с учётом доверенного
// числа хопов за nginx, а не берёт значение, которое клиент может подделать.
export function resolveClientIp(request: Request): string | null {
  const ip = request.ip;
  if (!ip) return null;
  return ip.length > IP_MAX_LENGTH ? ip.slice(0, IP_MAX_LENGTH) : ip;
}

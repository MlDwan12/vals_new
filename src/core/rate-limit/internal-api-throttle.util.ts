import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { Request } from 'express';
import { EnvConfig } from '../../config/env.validation';

export const INTERNAL_KEY_HEADER = 'x-internal-key';

// Не === — обычное сравнение строк выходит раньше на первом несовпавшем байте, что в теории
// (мал риск, но бесплатно закрыть) утекает через тайминг ответа тому, кто уже добрался до
// internal-сети (/code-review high на этом же батче). Разная длина сравниваемых буферов сама по
// себе бросает исключение в timingSafeEqual — проверяем длину явно и первой, до вызова.
function safeEqual(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(expected);
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}

// Динамический лимит для ThrottlerModule (R8, round-2 review): SSR публичного сайта ходит в API
// напрямую по docker-сети, минуя nginx, и весь его трафик попадает в общий с реальными
// посетителями IP-бакет глобального троттлера. @nestjs/throttler 6 поддерживает `limit` как
// функцию от ExecutionContext — этого достаточно, отдельный guard-класс не нужен.
//
// INTERNAL_API_KEY не задан (undefined) → всегда defaultLimit, сравнение заголовка не происходит
// вообще — иначе не заданный в проде env + стёртый nginx'ом до пустой строки заголовок дали бы
// молчаливое совпадение "" === "" и bypass для всех.
export function resolveGlobalThrottleLimit(
  configService: ConfigService<EnvConfig, true>,
  defaultLimit: number,
) {
  // Читаются один раз при старте модуля (env статичен на весь жизненный цикл процесса), а не на
  // каждый запрос — возвращаемое замыкание вызывается глобальным троттлером на почти каждом
  // запросе (efficiency review).
  const internalKey = configService.get('INTERNAL_API_KEY', { infer: true });
  const elevatedLimit = configService.get('INTERNAL_API_RATE_LIMIT', {
    infer: true,
  });

  return (context: ExecutionContext): number => {
    if (!internalKey) return defaultLimit;

    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers[INTERNAL_KEY_HEADER];
    if (typeof provided === 'string' && safeEqual(provided, internalKey)) {
      return elevatedLimit;
    }
    return defaultLimit;
  };
}

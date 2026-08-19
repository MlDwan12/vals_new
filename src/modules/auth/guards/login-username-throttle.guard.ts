import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { BoundedTtlMap } from '../../../core/collections/bounded-ttl-map';

interface Attempt {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;
// Ключ — присланный клиентом username, не связан с реальными учётками — при MAX_TRACKED записями
// сметаем протухшие (LOW code review: без этого злоумышленник, перебирающий случайные логины,
// растит Map неограниченно).
const MAX_TRACKED_USERNAMES = 5000;

// Второй, независимый от IP лимит на логин (ТЗ §6: «жёсткий лимит по IP + по логину») — держит
// в узде распределённый подбор пароля к одному аккаунту с разных IP. In-memory, без Redis (вне
// рамок ТЗ §12) — счётчик на процесс, протухает по resetAt при следующем обращении к тому же
// username; для админ-панели с ограниченным числом логинов это приемлемо, лишние записи чистятся
// лениво при разрастании Map (см. BoundedTtlMap).
@Injectable()
export class LoginUsernameThrottleGuard implements CanActivate {
  private readonly attempts = new BoundedTtlMap<Attempt>(
    MAX_TRACKED_USERNAMES,
    (attempt) => attempt.resetAt <= Date.now(),
  );

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const body = request.body as { username?: unknown } | undefined;
    const username =
      typeof body?.username === 'string'
        ? body.username.trim().toLowerCase()
        : null;

    if (!username) {
      return true;
    }

    const now = Date.now();
    const existing = this.attempts.get(username);

    if (!existing || existing.resetAt <= now) {
      this.attempts.set(username, { count: 1, resetAt: now + WINDOW_MS });
      return true;
    }

    if (existing.count >= MAX_ATTEMPTS) {
      throw new HttpException(
        'Слишком много попыток входа для этого логина, попробуйте позже',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    existing.count += 1;
    // Обновляет позицию записи в порядке вставки (BoundedTtlMap выселяет старейшие первыми под
    // атакой быстрее TTL-окна) — активно повторяющийся логин не должен вытесниться раньше давно
    // неактивного.
    this.attempts.set(username, existing);
    return true;
  }
}

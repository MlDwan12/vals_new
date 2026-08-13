import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';

interface Attempt {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;

// Второй, независимый от IP лимит на логин (ТЗ §6: «жёсткий лимит по IP + по логину») — держит
// в узде распределённый подбор пароля к одному аккаунту с разных IP. In-memory, без Redis (вне
// рамок ТЗ §12) — счётчик на процесс, протухает по resetAt при следующем обращении к тому же
// username; активной чистки старых записей нет, для админ-панели с ограниченным числом логинов
// это приемлемо.
@Injectable()
export class LoginUsernameThrottleGuard implements CanActivate {
  private readonly attempts = new Map<string, Attempt>();

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
    return true;
  }
}

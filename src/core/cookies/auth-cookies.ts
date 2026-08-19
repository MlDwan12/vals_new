import { ConfigService } from '@nestjs/config';
import { CookieOptions, Response } from 'express';
import { EnvConfig } from '../../config/env.validation';

export const ACCESS_TOKEN_COOKIE = 'accessToken';
export const REFRESH_TOKEN_COOKIE = 'refreshToken';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface CookieTtl {
  accessMs: number;
  refreshMs: number;
}

// sameSite одинаковый во всех трёх местах (login/refresh/logout) — ТЗ §6. 'lax', а не 'strict':
// 'strict' не шлёт куку при переходе по внешней ссылке на админку, что ломает первый заход.
// CSRF при этом закрыт отдельным глобальным guard'ом на Origin (см. CsrfOriginGuard).
function baseCookieOptions(
  configService: ConfigService<EnvConfig, true>,
): CookieOptions {
  return {
    httpOnly: true,
    secure: configService.get('NODE_ENV', { infer: true }) === 'production',
    sameSite: 'lax',
  };
}

// Refresh-токен читается только на /auth/refresh и /auth/logout (RefreshStrategy) — path: '/auth'
// сужает куку так, что браузер не шлёт её на каждый обычный запрос (только там, где она реально
// нужна).
const REFRESH_COOKIE_PATH = '/auth';

export function setAuthCookies(
  res: Response,
  configService: ConfigService<EnvConfig, true>,
  tokens: AuthTokens,
  ttl: CookieTtl,
): void {
  const options = baseCookieOptions(configService);
  res.cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
    ...options,
    maxAge: ttl.accessMs,
  });
  res.cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
    ...options,
    path: REFRESH_COOKIE_PATH,
    maxAge: ttl.refreshMs,
  });
}

export function clearAuthCookies(
  res: Response,
  configService: ConfigService<EnvConfig, true>,
): void {
  const options = baseCookieOptions(configService);
  res.clearCookie(ACCESS_TOKEN_COOKIE, options);
  res.clearCookie(REFRESH_TOKEN_COOKIE, {
    ...options,
    path: REFRESH_COOKIE_PATH,
  });
}

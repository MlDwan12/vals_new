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

// path НЕ сужается до '/auth': оба фронта ходят через префикс '/api' (nginx срезает его перед
// проксированием), а решение «слать куку или нет» браузер принимает по пути СВОЕГО запроса
// ('/api/auth/refresh'), до nginx — Path='/auth' не является его префиксом, и кука не долетает
// (R1, round-2 review). Кука и так httpOnly, сужение пути не давало защиты, только регрессию.

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
    maxAge: ttl.refreshMs,
  });
}

export function clearAuthCookies(
  res: Response,
  configService: ConfigService<EnvConfig, true>,
): void {
  const options = baseCookieOptions(configService);
  res.clearCookie(ACCESS_TOKEN_COOKIE, options);
  res.clearCookie(REFRESH_TOKEN_COOKIE, options);
}

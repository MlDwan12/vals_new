import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RefreshTokenPayload } from '../strategies/refresh.strategy';

// Отдельная passport-стратегия 'jwt-refresh' — проверяет refresh-куку, не access.
// Используется только на /auth/refresh и /auth/logout (оба помечены @Public() для глобального
// AuthGuard, т.к. на этих роутах валидного access-токена может не быть вовсе).
@Injectable()
export class RefreshAuthGuard extends AuthGuard('jwt-refresh') {
  // Без переопределения passport при отсутствующей/невалидной refresh-куке бросает стоковый
  // UnauthorizedException('Unauthorized') — единственное место в проекте, где 401 приходит не на
  // русском (core/guards/auth.guard.ts везде бросает 'Требуется авторизация'). Здесь та же ошибка,
  // но text приведён к общему контракту.
  handleRequest<TUser = RefreshTokenPayload>(
    err: unknown,
    user: TUser | false,
  ): TUser {
    if (err || !user) {
      throw new UnauthorizedException('Требуется авторизация');
    }
    return user;
  }
}

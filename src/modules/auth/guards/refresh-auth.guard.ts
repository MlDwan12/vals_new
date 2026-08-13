import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Отдельная passport-стратегия 'jwt-refresh' — проверяет refresh-куку, не access.
// Используется только на /auth/refresh и /auth/logout (оба помечены @Public() для глобального
// AuthGuard, т.к. на этих роутах валидного access-токена может не быть вовсе).
@Injectable()
export class RefreshAuthGuard extends AuthGuard('jwt-refresh') {}

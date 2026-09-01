import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { EnvConfig } from '../../config/env.validation';
import { AuthContextService } from '../../modules/users/application/auth-context.service';
import { ACCESS_TOKEN_COOKIE } from '../cookies/auth-cookies';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PERM_KEY } from '../decorators/perm.decorator';
import { PermissionCode } from '../permissions/permission.registry';

// Токен несёт только идентификатор пользователя (EXPANSION_TASKS.md §1.4) — роль/права/isActive/
// access_expires_at читаются живьём из БД на каждый запрос через AuthContextService, не из JWT,
// поэтому отключение/смена роли/истечение доступа действуют на следующем же запросе.
export interface AccessTokenPayload {
  sub: number;
}

export interface AuthenticatedRequestUser {
  sub: number;
  username: string;
  role: string;
  rank: number;
  isSystem: boolean;
  permissions: ReadonlySet<PermissionCode>;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly authContextService: AuthContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = (request.cookies as Record<string, string | undefined>)[
      ACCESS_TOKEN_COOKIE
    ];

    if (!token) {
      throw new UnauthorizedException('Требуется авторизация');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token, {
        secret: this.configService.get('JWT_SECRET', { infer: true }),
        // Явно запинено — без этого jsonwebtoken принимает alg из заголовка самого токена
        // (alg confusion). Это реальный путь верификации access-токена (JwtStrategy с тем же
        // alg-пином — мёртвый код, ни одного AuthGuard('jwt') в проекте, N7 round-2 review).
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('Требуется авторизация');
    }

    // Живой запрос к БД — единственное сообщение здесь (не 3 разных, это требование только для
    // /auth/login, EXPANSION_TASKS.md §1.6 в приёмке).
    const requestUser = await this.authContextService.resolveRequestUser(
      payload.sub,
    );

    // request.user выставляется ДО проверки прав — иначе отказ по @Perm() улетает в
    // HttpExceptionFilter/AuditService как анонимный (userId/username: null), хотя личность уже
    // установлена (security-audit-2026-08-31.md, находка №1 — проверено при подключении @Perm()
    // к контентным контроллерам, обнаружено регрессией audit-logs.e2e-spec.ts §2.4).
    (request as Request & { user: AuthenticatedRequestUser }).user =
      requestUser;

    // Гвард аутентификации и проверки прав — один и тот же (EXPANSION_TASKS.md §1.2/§1.4):
    // отдельному гварду понадобился бы уже заполненный request.user, а порядок гвардов в Nest не
    // гарантирован — тихая дыра. is_system — байпас, не зависящий от role_permissions (§1.1).
    const requiredPermissions = this.reflector.getAllAndOverride<
      PermissionCode[] | undefined
    >(PERM_KEY, [context.getHandler(), context.getClass()]);

    if (
      requiredPermissions?.length &&
      !requestUser.isSystem &&
      !requiredPermissions.every((code) => requestUser.permissions.has(code))
    ) {
      throw new ForbiddenException('Недостаточно прав для выполнения операции');
    }

    return true;
  }
}

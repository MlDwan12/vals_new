import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { EnvConfig } from '../../config/env.validation';
import { ACCESS_TOKEN_COOKIE } from '../cookies/auth-cookies';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { Role } from '../enums/role.enum';

// Форма совпадает с AccessTokenPayload из modules/auth/strategies/jwt.strategy.ts по контракту
// (одинаковый JWT), но не импортируется оттуда напрямую — core не должен зависеть от feature-модулей.
export interface AuthenticatedRequestUser {
  sub: number;
  username: string;
  role: Role;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<EnvConfig, true>,
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

    try {
      const payload =
        await this.jwtService.verifyAsync<AuthenticatedRequestUser>(token, {
          secret: this.configService.get('JWT_SECRET', { infer: true }),
          // Явно запинено — без этого jsonwebtoken принимает alg из заголовка самого токена
          // (alg confusion). Это реальный путь верификации access-токена (JwtStrategy с тем же
          // alg-пином — мёртвый код, ни одного AuthGuard('jwt') в проекте, N7 round-2 review).
          algorithms: ['HS256'],
        });
      (request as Request & { user: AuthenticatedRequestUser }).user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Требуется авторизация');
    }
  }
}

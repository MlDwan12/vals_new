import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { EnvConfig } from '../../../config/env.validation';
import { ACCESS_TOKEN_COOKIE } from '../../../core/cookies/auth-cookies';

// Токен несёт только id пользователя (EXPANSION_TASKS.md §1.4) — роль/права читаются живьём из БД
// на каждый запрос (core/guards/auth.guard.ts::AuthContextService), не из токена.
export interface AccessTokenPayload {
  sub: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(configService: ConfigService<EnvConfig, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors<Request>([
        (req) =>
          (req.cookies as Record<string, string | undefined>)[
            ACCESS_TOKEN_COOKIE
          ] ?? null,
      ]),
      secretOrKey: configService.get('JWT_SECRET', { infer: true }),
      // Явно запинено — без этого passport-jwt принимает alg из заголовка самого токена
      // (alg confusion, если бы когда-нибудь появился второй ключ/алгоритм).
      algorithms: ['HS256'],
    });
  }

  validate(payload: AccessTokenPayload): AccessTokenPayload {
    return payload;
  }
}

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { EnvConfig } from '../../../config/env.validation';
import { REFRESH_TOKEN_COOKIE } from '../../../core/cookies/auth-cookies';

export interface RefreshTokenPayload {
  sub: number;
  jti: string;
}

@Injectable()
export class RefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor(configService: ConfigService<EnvConfig, true>) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors<Request>([
        (req) =>
          (req.cookies as Record<string, string | undefined>)[
            REFRESH_TOKEN_COOKIE
          ] ?? null,
      ]),
      secretOrKey: configService.get('JWT_REFRESH_SECRET', { infer: true }),
    });
  }

  validate(payload: RefreshTokenPayload): RefreshTokenPayload {
    return payload;
  }
}

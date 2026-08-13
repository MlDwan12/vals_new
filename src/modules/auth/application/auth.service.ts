import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PinoLogger } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';
import { EnvConfig } from '../../../config/env.validation';
import { User } from '../../users/domain/user.entity';
import { UsersService } from '../../users/application/users.service';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from '../auth.constants';
import { RefreshSessionsRepository } from '../infrastructure/refresh-sessions.repository';
import { AccessTokenPayload } from '../strategies/jwt.strategy';
import { RefreshTokenPayload } from '../strategies/refresh.strategy';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService<EnvConfig, true>,
    private readonly usersService: UsersService,
    private readonly refreshSessionsRepository: RefreshSessionsRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AuthService.name);
  }

  async validateUser(username: string, password: string): Promise<User | null> {
    const user = await this.usersService.findForAuth(username);
    if (!user || !user.isActive) {
      return null;
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    return passwordMatches ? user : null;
  }

  login(user: User, fingerprint: string | null): Promise<AuthTokens> {
    return this.issueTokens(user, fingerprint);
  }

  async refresh(
    payload: RefreshTokenPayload,
    fingerprint: string | null,
  ): Promise<AuthTokens> {
    const session = await this.refreshSessionsRepository.findByJti(payload.jti);

    if (!session) {
      throw new UnauthorizedException('Сессия не найдена');
    }

    if (session.revokedAt) {
      // Повторное использование уже отозванного refresh — вероятная компрометация токена,
      // гасим все сессии пользователя (ТЗ §5.2).
      this.logger.warn(
        { userId: session.userId },
        'Повторное использование отозванного refresh-токена — все сессии пользователя отозваны',
      );
      await this.refreshSessionsRepository.revokeAllForUser(session.userId);
      throw new UnauthorizedException('Токен обновления недействителен');
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Токен обновления истёк');
    }

    const user = await this.usersService
      .findById(session.userId)
      .catch(() => null);
    if (!user || !user.isActive) {
      await this.refreshSessionsRepository.revoke(session.id);
      throw new UnauthorizedException('Пользователь недоступен');
    }

    // Ротация: старая сессия гасится, новая пара токенов привязана к новой сессии.
    await this.refreshSessionsRepository.revoke(session.id);
    return this.issueTokens(user, fingerprint);
  }

  async logout(payload: RefreshTokenPayload): Promise<void> {
    const session = await this.refreshSessionsRepository.findByJti(payload.jti);
    if (session && !session.revokedAt) {
      await this.refreshSessionsRepository.revoke(session.id);
    }
  }

  getMe(userId: number): Promise<User> {
    return this.usersService.findById(userId);
  }

  private async issueTokens(
    user: User,
    fingerprint: string | null,
  ): Promise<AuthTokens> {
    const jti = randomUUID();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);

    await this.refreshSessionsRepository.create({
      jti,
      userId: user.id,
      fingerprint,
      expiresAt,
    });

    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };
    const refreshPayload: RefreshTokenPayload = { sub: user.id, jti };

    const accessToken = await this.jwtService.signAsync(accessPayload, {
      secret: this.configService.get('JWT_SECRET', { infer: true }),
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });

    const refreshToken = await this.jwtService.signAsync(refreshPayload, {
      secret: this.configService.get('JWT_REFRESH_SECRET', { infer: true }),
      expiresIn: REFRESH_TOKEN_TTL_SECONDS,
    });

    return { accessToken, refreshToken };
  }
}

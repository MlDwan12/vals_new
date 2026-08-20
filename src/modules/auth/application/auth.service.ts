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
  REFRESH_RACE_GRACE_MS,
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
      // Безусловно — без grace-исключения (ТЗ §5.2). Эта ветка достижима, только если НАШ SELECT
      // прочитал уже полностью завершённую чужую ротацию — то есть по определению НЕ одновременно
      // с ней: настоящая гонка двух вкладок физически не может сюда попасть (оба SELECT идут раньше
      // любого UPDATE, проигравший обнаруживает конфликт через failed revoke() ниже, не через уже
      // отозванный session.revokedAt на собственном чтении). Grace здесь — не сужение окна гонки, а
      // дыра в детекции реального реюза: подтверждено падением e2e (`auth.e2e-spec.ts`) и живым
      // security-review — исключение сюда добавлялось ошибочно (round-2 review batch), убрано.
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

    // Ротация: старая сессия гасится атомарно (WHERE revoked_at IS NULL). Если гасить было
    // нечего (affected === 0) — значит параллельный запрос тем же токеном уже успел это сделать
    // между нашим SELECT выше и этим UPDATE.
    const revoked = await this.refreshSessionsRepository.revoke(session.id);
    if (!revoked) {
      // Дедуп на фронте защищает только запросы внутри одной вкладки — две вкладки одного
      // браузера, простаивавшие до истечения access-токена, гоняют refresh независимо и здесь
      // сталкиваются лбами (R6, round-2 review). Если сессию отозвали только что и тем же
      // fingerprint (IP+UA, тот же браузер/устройство) — это гонка, не реюз украденного токена:
      // проигравший получает 401 сам по себе, без массового разлогина легитимных устройств.
      const current = await this.refreshSessionsRepository.findByJti(
        payload.jti,
      );
      const isLikelyRace = this.isLikelyRefreshRace(
        current?.revokedAt ?? null,
        current?.fingerprint ?? null,
        fingerprint,
      );

      if (!isLikelyRace) {
        this.logger.warn(
          { userId: session.userId },
          'Гонка ротации refresh-токена — все сессии пользователя отозваны',
        );
        await this.refreshSessionsRepository.revokeAllForUser(session.userId);
      }
      throw new UnauthorizedException('Токен обновления недействителен');
    }
    return this.issueTokens(user, fingerprint);
  }

  // Общая проверка для обеих точек, где сессия уже отозвана к моменту refresh (session.revokedAt
  // из первого SELECT и current.revokedAt из повторного SELECT после проигранного atomic revoke)
  // — вынесено, чтобы grace-период не защищал только один из двух интерливингов гонки (R6,
  // round-2 review; найдено /code-review high на этом же батче: изначально было только во втором
  // месте). fingerprint !== null обязателен в обеих частях — иначе null === null ложно засчитался
  // бы как "тот же браузер" (сегодня fingerprintOf() всегда возвращает строку, но тип допускает
  // null, полагаться на текущее поведение вызывающего кода не стоит).
  private isLikelyRefreshRace(
    revokedAt: Date | null,
    sessionFingerprint: string | null,
    requestFingerprint: string | null,
  ): boolean {
    return Boolean(
      revokedAt &&
      Date.now() - revokedAt.getTime() <= REFRESH_RACE_GRACE_MS &&
      requestFingerprint !== null &&
      sessionFingerprint === requestFingerprint,
    );
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

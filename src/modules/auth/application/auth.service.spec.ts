import { UnauthorizedException } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { AuthService } from './auth.service';
import { RefreshTokenPayload } from '../strategies/refresh.strategy';

// R6 (round-2 review): две вкладки одного браузера, простаивавшие до истечения access-токена,
// одновременно шлют refresh тем же токеном. Атомарный revoke() (H8) корректно пускает только
// одну — но раньше проигравший безусловно трактовался как реюз украденного токена и гасил ВСЕ
// сессии пользователя. Ниже — регресс-тесты на grace-период, отличающий гонку от реального реюза.

const PAYLOAD: RefreshTokenPayload = { sub: 1, jti: 'session-jti' };
const FINGERPRINT = '127.0.0.1|Mozilla/5.0';

function buildSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    jti: PAYLOAD.jti,
    userId: 1,
    fingerprint: FINGERPRINT,
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
    ...overrides,
  };
}

function createService(overrides: {
  findByJti?: jest.Mock;
  revoke?: jest.Mock;
  revokeAllForUser?: jest.Mock;
}) {
  const refreshSessionsRepository = {
    findByJti: overrides.findByJti ?? jest.fn(),
    create: jest.fn().mockResolvedValue({}),
    revoke: overrides.revoke ?? jest.fn(),
    revokeAllForUser: overrides.revokeAllForUser ?? jest.fn(),
  };
  const usersService = {
    findById: jest.fn().mockResolvedValue({
      id: 1,
      isActive: true,
      username: 'u',
      role: 'admin',
    }),
  };
  const jwtService = {
    signAsync: jest.fn().mockResolvedValue('token'),
  };
  const configService = { get: jest.fn().mockReturnValue('secret') };
  const logger = {
    setContext: jest.fn(),
    warn: jest.fn(),
  } as unknown as PinoLogger;

  const service = new AuthService(
    jwtService as never,
    configService as never,
    usersService as never,
    refreshSessionsRepository as never,
    logger,
  );

  return { service, refreshSessionsRepository };
}

describe('AuthService.refresh — гонка ротации токена', () => {
  it('успешная ротация (revoke выигран) — выдаёт новую пару токенов', async () => {
    const { service, refreshSessionsRepository } = createService({
      findByJti: jest.fn().mockResolvedValue(buildSession()),
      revoke: jest.fn().mockResolvedValue(true),
    });

    const tokens = await service.refresh(PAYLOAD, FINGERPRINT);

    expect(tokens.accessToken).toBe('token');
    expect(refreshSessionsRepository.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('проигрыш гонки: revoke только что, тот же fingerprint — 401 без массового отзыва', async () => {
    const raceRevokedAt = new Date(Date.now() - 300); // 300мс назад — внутри grace-окна (2с)
    const { service, refreshSessionsRepository } = createService({
      findByJti: jest
        .fn()
        .mockResolvedValueOnce(buildSession()) // первый SELECT — ещё не отозвана
        .mockResolvedValueOnce(
          buildSession({ revokedAt: raceRevokedAt, fingerprint: FINGERPRINT }),
        ), // повторный SELECT после проигранного revoke()
      revoke: jest.fn().mockResolvedValue(false),
    });

    await expect(service.refresh(PAYLOAD, FINGERPRINT)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(refreshSessionsRepository.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('revoke был давно (вне grace-окна) — трактуется как реюз, гасит все сессии', async () => {
    const oldRevokedAt = new Date(Date.now() - 60_000); // 60с назад
    const { service, refreshSessionsRepository } = createService({
      findByJti: jest
        .fn()
        .mockResolvedValueOnce(buildSession())
        .mockResolvedValueOnce(
          buildSession({ revokedAt: oldRevokedAt, fingerprint: FINGERPRINT }),
        ),
      revoke: jest.fn().mockResolvedValue(false),
    });

    await expect(service.refresh(PAYLOAD, FINGERPRINT)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(refreshSessionsRepository.revokeAllForUser).toHaveBeenCalledWith(1);
  });

  it('revoke только что, но другой fingerprint — трактуется как реюз, гасит все сессии', async () => {
    const raceRevokedAt = new Date(Date.now() - 1_000);
    const { service, refreshSessionsRepository } = createService({
      findByJti: jest
        .fn()
        .mockResolvedValueOnce(buildSession())
        .mockResolvedValueOnce(
          buildSession({ revokedAt: raceRevokedAt, fingerprint: 'другой' }),
        ),
      revoke: jest.fn().mockResolvedValue(false),
    });

    await expect(service.refresh(PAYLOAD, FINGERPRINT)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(refreshSessionsRepository.revokeAllForUser).toHaveBeenCalledWith(1);
  });

  it('revoke только что, но оба fingerprint null — НЕ трактуется как гонка, гасит все сессии', async () => {
    // altitude-находка `/simplify`: null === null не должен ложно засчитываться как "тот же
    // браузер" — тип fingerprint допускает null, даже если fingerprintOf() сегодня его не отдаёт.
    const raceRevokedAt = new Date(Date.now() - 1_000);
    const { service, refreshSessionsRepository } = createService({
      findByJti: jest
        .fn()
        .mockResolvedValueOnce(buildSession({ fingerprint: null }))
        .mockResolvedValueOnce(
          buildSession({ revokedAt: raceRevokedAt, fingerprint: null }),
        ),
      revoke: jest.fn().mockResolvedValue(false),
    });

    await expect(service.refresh(PAYLOAD, null)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(refreshSessionsRepository.revokeAllForUser).toHaveBeenCalledWith(1);
  });

  it('явный реюз уже отозванной сессии, отозвана давно — гасит все сессии', async () => {
    const { service, refreshSessionsRepository } = createService({
      findByJti: jest.fn().mockResolvedValue(
        buildSession({ revokedAt: new Date(Date.now() - 60_000) }), // 60с назад
      ),
    });

    await expect(service.refresh(PAYLOAD, FINGERPRINT)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(refreshSessionsRepository.revokeAllForUser).toHaveBeenCalledWith(1);
  });

  // Живой e2e (auth.e2e-spec.ts) поймал регрессию: grace в этой ветке ошибочно распространили на
  // случай, когда НАШ SELECT уже видит чужую завершённую ротацию — это по определению не может
  // быть настоящей гонкой (обе стороны гонки читают ДО завершения любого UPDATE, проигравший
  // определяется через failed revoke() ниже, не через уже отозванный revokedAt на своём чтении).
  // Никакого grace здесь быть не должно — убрано после независимого приёмочного аудита.
  it('session.revokedAt виден уже на первом SELECT (даже недавно и с тем же fingerprint) — всё равно массовый отзыв', async () => {
    const raceRevokedAt = new Date(Date.now() - 1_000);
    const { service, refreshSessionsRepository } = createService({
      findByJti: jest
        .fn()
        .mockResolvedValue(
          buildSession({ revokedAt: raceRevokedAt, fingerprint: FINGERPRINT }),
        ),
    });

    await expect(service.refresh(PAYLOAD, FINGERPRINT)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(refreshSessionsRepository.revokeAllForUser).toHaveBeenCalledWith(1);
  });
});

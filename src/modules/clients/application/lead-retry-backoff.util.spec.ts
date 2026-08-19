import { isRetryableBitrixStatus } from './lead-retry-backoff.util';

describe('isRetryableBitrixStatus', () => {
  it('сетевая ошибка/таймаут (нет status) — ретраится', () => {
    expect(isRetryableBitrixStatus(undefined)).toBe(true);
  });

  it('429 (rate limit) — ретраится', () => {
    expect(isRetryableBitrixStatus(429)).toBe(true);
  });

  it('5xx — ретраится', () => {
    expect(isRetryableBitrixStatus(500)).toBe(true);
    expect(isRetryableBitrixStatus(503)).toBe(true);
  });

  it('4xx кроме 429 — не ретраится (постоянная проблема)', () => {
    expect(isRetryableBitrixStatus(400)).toBe(false);
    expect(isRetryableBitrixStatus(401)).toBe(false);
    expect(isRetryableBitrixStatus(403)).toBe(false);
    expect(isRetryableBitrixStatus(404)).toBe(false);
  });

  it('2xx — ретраится (сюда не должны попадать, но на всякий случай не блокирует)', () => {
    expect(isRetryableBitrixStatus(200)).toBe(true);
  });
});

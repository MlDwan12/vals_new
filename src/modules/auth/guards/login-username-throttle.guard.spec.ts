import { ExecutionContext, HttpException, HttpStatus } from '@nestjs/common';
import { LoginUsernameThrottleGuard } from './login-username-throttle.guard';

function contextFor(username: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ body: { username } }),
    }),
  } as unknown as ExecutionContext;
}

// N-1 (round-3 review): защита заблокированных записей от FIFO-вытеснения (R5) сама породила дыру —
// при карте, насыщенной ИСКЛЮЧИТЕЛЬНО заблокированными username, свежевставленная запись жертвы
// вытесняла сама себя, и лимит по username переставал работать для всех новых логинов. Тест
// воспроизводит ровно сценарий ревьюера на уровне guard'а (не карты в отрыве от потребителя,
// bounded-ttl-map.spec.ts это не ловит), против реального MAX_TRACKED_USERNAMES=5000.
describe('LoginUsernameThrottleGuard', () => {
  it('лимит по username работает даже когда карта полностью насыщена заблокированными логинами', () => {
    const guard = new LoginUsernameThrottleGuard();

    for (let i = 0; i < 5000; i += 1) {
      const username = `attacker-${i}`;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        guard.canActivate(contextFor(username));
      }
    }

    let blockedAt = -1;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        guard.canActivate(contextFor('victim'));
      } catch (err) {
        expect(err).toBeInstanceOf(HttpException);
        expect((err as HttpException).getStatus()).toBe(
          HttpStatus.TOO_MANY_REQUESTS,
        );
        blockedAt = attempt;
        break;
      }
    }

    expect(blockedAt).toBe(5);
  });

  it('обычный логин без насыщения карты по-прежнему блокируется после MAX_ATTEMPTS', () => {
    const guard = new LoginUsernameThrottleGuard();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(guard.canActivate(contextFor('user'))).toBe(true);
    }

    expect(() => guard.canActivate(contextFor('user'))).toThrow(HttpException);
  });

  it('запрос без username пропускается без учёта в карте', () => {
    const guard = new LoginUsernameThrottleGuard();

    expect(guard.canActivate(contextFor(''))).toBe(true);
    const ctxWithoutBody = {
      switchToHttp: () => ({ getRequest: () => ({}) }),
    } as unknown as ExecutionContext;
    expect(guard.canActivate(ctxWithoutBody)).toBe(true);
  });

  // Б2 (независимый аудит 2026-08-21): guard выполняется раньше ValidationPipe, поэтому @MaxLength
  // на LoginDto его не защищает — без отдельной обрезки здесь username использовался бы как ключ
  // BoundedTtlMap без верхней границы длины.
  it('длинный username обрезается до одного ключа независимо от хвоста строки', () => {
    const guard = new LoginUsernameThrottleGuard();
    const prefix = 'victim'.padEnd(50, 'x');

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(guard.canActivate(contextFor(`${prefix}-tail-a`))).toBe(true);
    }

    expect(() => guard.canActivate(contextFor(`${prefix}-tail-b`))).toThrow(
      HttpException,
    );
  });
});

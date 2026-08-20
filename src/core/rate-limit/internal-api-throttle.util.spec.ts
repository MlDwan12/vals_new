import { ExecutionContext } from '@nestjs/common';
import {
  INTERNAL_KEY_HEADER,
  resolveGlobalThrottleLimit,
} from './internal-api-throttle.util';

const DEFAULT_LIMIT = 100;
const ELEVATED_LIMIT = 3000;

function buildContext(headers: Record<string, string> = {}): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers }),
    }),
  } as unknown as ExecutionContext;
}

function buildConfigService(internalKey: string | undefined) {
  return {
    get: jest.fn((key: string) => {
      if (key === 'INTERNAL_API_KEY') return internalKey;
      if (key === 'INTERNAL_API_RATE_LIMIT') return ELEVATED_LIMIT;
      throw new Error(`unexpected key: ${key}`);
    }),
  };
}

describe('resolveGlobalThrottleLimit', () => {
  describe('INTERNAL_API_KEY задан', () => {
    const resolve = resolveGlobalThrottleLimit(
      buildConfigService('secret-key') as never,
      DEFAULT_LIMIT,
    );

    it('валидный ключ в заголовке — повышенный лимит (не троттлится глобальным)', () => {
      const limit = resolve(
        buildContext({ [INTERNAL_KEY_HEADER]: 'secret-key' }),
      );
      expect(limit).toBe(ELEVATED_LIMIT);
    });

    it('заголовка нет — обычный лимит (троттлится как раньше)', () => {
      expect(resolve(buildContext())).toBe(DEFAULT_LIMIT);
    });

    it('неверный ключ в заголовке — обычный лимит', () => {
      const limit = resolve(
        buildContext({ [INTERNAL_KEY_HEADER]: 'wrong-key' }),
      );
      expect(limit).toBe(DEFAULT_LIMIT);
    });
  });

  // R8, round-2 review: не заданный в env INTERNAL_API_KEY должен полностью выключать bypass, а
  // не совпадать с пустым заголовком (nginx стирает заголовок у внешнего трафика до "").
  describe('INTERNAL_API_KEY не задан', () => {
    const resolve = resolveGlobalThrottleLimit(
      buildConfigService(undefined) as never,
      DEFAULT_LIMIT,
    );

    it('обычный лимит, даже если заголовок пуст', () => {
      const limit = resolve(buildContext({ [INTERNAL_KEY_HEADER]: '' }));
      expect(limit).toBe(DEFAULT_LIMIT);
    });

    it('обычный лимит, даже если заголовка нет вовсе', () => {
      expect(resolve(buildContext())).toBe(DEFAULT_LIMIT);
    });
  });
});

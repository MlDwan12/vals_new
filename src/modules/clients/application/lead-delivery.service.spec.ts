import { PinoLogger } from 'nestjs-pino';
import { LeadDeliveryService } from './lead-delivery.service';
import { ClientLead } from '../domain/client-lead.entity';

function buildLead(): ClientLead {
  return {
    id: 1,
    retryCount: 0,
    bitrixPayload: {},
  } as ClientLead;
}

function buildLogger(): PinoLogger {
  return {
    setContext: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as PinoLogger;
}

interface Mocks {
  sendLead: jest.Mock;
  markSent: jest.Mock;
  markFailedAttempt: jest.Mock;
}

function createService(): { service: LeadDeliveryService; mocks: Mocks } {
  const mocks: Mocks = {
    sendLead: jest
      .fn()
      .mockResolvedValue({ bitrixLeadId: '42', response: { result: 42 } }),
    markSent: jest.fn().mockResolvedValue({ id: 1, status: 'sent' }),
    markFailedAttempt: jest
      .fn()
      .mockResolvedValue({ id: 1, status: 'pending' }),
  };
  const service = new LeadDeliveryService(
    { sendLead: mocks.sendLead } as never,
    {
      markSent: mocks.markSent,
      markFailedAttempt: mocks.markFailedAttempt,
    } as never,
    buildLogger(),
  );
  return { service, mocks };
}

describe('LeadDeliveryService.attemptDelivery', () => {
  // N1 (round-2 review): markSent раньше был внутри того же try, что и sendLead — если Bitrix уже
  // принял лид, а запись SENT в БД падала (обрыв пула, дедлок), это трактовалось как неудача
  // доставки и лид улетал обратно в PENDING/retry: планировщик отправлял его в Bitrix повторно —
  // детерминированный дубль в CRM. Ниже — регресс-тесты именно на этот сценарий.
  // markSentWithRetry ждёт между попытками реальным setTimeout — без fake timers тесты на retry
  // реально спали бы по 300/600мс (efficiency review).
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('сохраняет SENT и не трогает markFailedAttempt при успешной доставке и записи', async () => {
    const { service, mocks } = createService();

    await service.attemptDelivery(buildLead());

    expect(mocks.markSent).toHaveBeenCalledTimes(1);
    expect(mocks.markFailedAttempt).not.toHaveBeenCalled();
  });

  it('дожимает markSent после транзиентного сбоя записи, не откатывая лид в retry', async () => {
    const { service, mocks } = createService();
    mocks.markSent
      .mockRejectedValueOnce(new Error('deadlock'))
      .mockResolvedValueOnce({ id: 1, status: 'sent' });

    const result = service.attemptDelivery(buildLead());
    await jest.advanceTimersByTimeAsync(300);
    await result;

    expect(mocks.markSent).toHaveBeenCalledTimes(2);
    expect(mocks.markFailedAttempt).not.toHaveBeenCalled();
  });

  it('после исчерпания попыток markSent бросает и НЕ откатывает лид в PENDING/FAILED (не даёт дубль в CRM)', async () => {
    const { service, mocks } = createService();
    mocks.markSent.mockRejectedValue(new Error('db unavailable'));

    const result = service.attemptDelivery(buildLead());
    const assertion = expect(result).rejects.toThrow('db unavailable');
    await jest.advanceTimersByTimeAsync(600);
    await assertion;

    expect(mocks.markFailedAttempt).not.toHaveBeenCalled();
  });

  it('классифицирует ошибку sendLead как обычно и не трогает markSent', async () => {
    const { service, mocks } = createService();
    mocks.sendLead.mockRejectedValue(new Error('network error'));

    await service.attemptDelivery(buildLead());

    expect(mocks.markFailedAttempt).toHaveBeenCalledTimes(1);
    expect(mocks.markSent).not.toHaveBeenCalled();
  });
});

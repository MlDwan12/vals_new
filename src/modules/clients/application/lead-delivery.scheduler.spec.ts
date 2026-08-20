import { PinoLogger } from 'nestjs-pino';
import { LeadDeliveryScheduler } from './lead-delivery.scheduler';

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function buildLogger(): { logger: PinoLogger; errorMock: jest.Mock } {
  const errorMock = jest.fn();
  const logger = {
    setContext: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: errorMock,
  } as unknown as PinoLogger;
  return { logger, errorMock };
}

describe('LeadDeliveryScheduler', () => {
  it('не запускает второй тик, пока первый ещё выполняется (медленный Bitrix)', async () => {
    const gate = deferred<void>();
    let attemptCalls = 0;

    const clientLeadsRepository = {
      findDueForDelivery: jest.fn().mockResolvedValue([{ id: 1 }]),
      claimForDelivery: jest.fn((id: number) => Promise.resolve({ id })),
    };
    const leadDeliveryService = {
      attemptDelivery: jest.fn(async () => {
        attemptCalls += 1;
        await gate.promise; // держим первый тик "в полёте", пока не отпустим явно
      }),
    };
    const { logger } = buildLogger();

    const scheduler = new LeadDeliveryScheduler(
      clientLeadsRepository as never,
      leadDeliveryService as never,
      logger,
    );

    const firstTick = scheduler.run(); // не await — имитируем зависший тик
    await Promise.resolve(); // даём microtask-очереди продвинуться до attemptDelivery

    await scheduler.run(); // второй тик по расписанию, пока первый ещё не завершился

    expect(clientLeadsRepository.findDueForDelivery).toHaveBeenCalledTimes(1);
    expect(attemptCalls).toBe(1);

    gate.resolve();
    await firstTick;

    // После завершения первого тика планировщик снова готов работать.
    await scheduler.run();
    expect(clientLeadsRepository.findDueForDelivery).toHaveBeenCalledTimes(2);
  });

  // Найдено при полном аудите проекта: markSentWithRetry (LeadDeliveryService) бросает после
  // исчерпания попыток — без catch здесь это исключение уходит из cron-тика мимо pino/redact в
  // сырой console.error библиотеки cron (второй, незащищённый канал утечки ПД лида).
  it('attemptDelivery бросает — тик не падает, ошибка залогирована через injected logger', async () => {
    const clientLeadsRepository = {
      findDueForDelivery: jest.fn().mockResolvedValue([{ id: 1 }]),
      claimForDelivery: jest.fn((id: number) => Promise.resolve({ id })),
    };
    const leadDeliveryService = {
      attemptDelivery: jest.fn().mockRejectedValue(new Error('db unavailable')),
    };
    const { logger, errorMock } = buildLogger();

    const scheduler = new LeadDeliveryScheduler(
      clientLeadsRepository as never,
      leadDeliveryService as never,
      logger,
    );

    await expect(scheduler.run()).resolves.toBeUndefined();

    expect(errorMock).toHaveBeenCalledWith(
      expect.objectContaining({ leadId: 1 }),
      expect.any(String),
    );
  });
});

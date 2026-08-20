import { PinoLogger } from 'nestjs-pino';
import { LeadDeliveryScheduler } from './lead-delivery.scheduler';

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

// deliverDueLeads — цепочка из нескольких await до attemptDelivery (failStuckDeliveries →
// findDueForDelivery → claimForDelivery → attemptDelivery); один await Promise.resolve() ловит
// только следующий microtask, не всю цепочку — flush с запасом устойчив к тому, что шагов
// прибавится ещё (не завязан на точное число).
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
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
      failStuckDeliveries: jest.fn().mockResolvedValue(0),
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
    await flushMicrotasks(); // даём microtask-очереди продвинуться до attemptDelivery

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
      failStuckDeliveries: jest.fn().mockResolvedValue(0),
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

  // N-2 (round-3 review): failStuckDeliveries вызывается ДО findDueForDelivery и его результат
  // виден в логе — иначе лиды, которым claimForDelivery уже отказал (счётчик реклеймов на
  // пределе), молча занимали бы место в каждом батче не продвигаясь никуда.
  it('лиды, сданные по лимиту реклеймов, логируются и не блокируют обычную доставку', async () => {
    const clientLeadsRepository = {
      failStuckDeliveries: jest.fn().mockResolvedValue(2),
      findDueForDelivery: jest.fn().mockResolvedValue([{ id: 5 }]),
      claimForDelivery: jest.fn((id: number) => Promise.resolve({ id })),
    };
    const leadDeliveryService = {
      attemptDelivery: jest.fn().mockResolvedValue({ id: 5, status: 'sent' }),
    };
    const { logger, errorMock } = buildLogger();

    const scheduler = new LeadDeliveryScheduler(
      clientLeadsRepository as never,
      leadDeliveryService as never,
      logger,
    );

    await scheduler.run();

    expect(clientLeadsRepository.failStuckDeliveries).toHaveBeenCalledTimes(1);
    expect(errorMock).toHaveBeenCalledWith(
      expect.objectContaining({ count: 2 }),
      expect.any(String),
    );
    // Обычная доставка due-лидов из этого же тика не пострадала.
    expect(leadDeliveryService.attemptDelivery).toHaveBeenCalledTimes(1);
  });
});

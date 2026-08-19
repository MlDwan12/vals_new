import { PinoLogger } from 'nestjs-pino';
import { LeadDeliveryScheduler } from './lead-delivery.scheduler';

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
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
    const logger = {
      setContext: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
    } as unknown as PinoLogger;

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
});

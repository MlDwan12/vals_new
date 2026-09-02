import { PinoLogger } from 'nestjs-pino';
import { ClientLeadsAdminService } from './client-leads-admin.service';
import { ClientLead } from '../domain/client-lead.entity';
import { LeadDeliveryStatus } from '../enums/lead-delivery-status.enum';

function buildLead(overrides: Partial<ClientLead> = {}): ClientLead {
  return {
    id: 1,
    status: LeadDeliveryStatus.SENDING,
    ...overrides,
  } as ClientLead;
}

// errorMock — отдельная переменная, не logger.error (@typescript-eslint/unbound-method: голая
// ссылка на метод объекта, переданная в expect(), теряет привязку this — тот же приём, что в
// tags.service.spec.ts).
function buildLogger(): { logger: PinoLogger; errorMock: jest.Mock } {
  const errorMock = jest.fn();
  const logger = {
    setContext: jest.fn(),
    error: errorMock,
  } as unknown as PinoLogger;
  return { logger, errorMock };
}

// security-audit-2026-08-31.md, LOW №14: attemptDelivery может бросить, даже когда Bitrix уже
// принял лид (markSentWithRetry исчерпала попытки записать SENT) — без перехвата ручной retry
// админа отдавал бы голый 500 вместо реального состояния лида.
describe('ClientLeadsAdminService.retry — не роняет 500, если Bitrix уже принял лид', () => {
  it('исчерпание markSentWithRetry логируется и отдаёт актуальное состояние лида, не бросает', async () => {
    const claimed = buildLead({ status: LeadDeliveryStatus.SENDING });
    const currentAfterFailure = buildLead({
      status: LeadDeliveryStatus.SENDING,
    });
    const claimForDelivery = jest.fn().mockResolvedValue(claimed);
    const findById = jest.fn().mockResolvedValueOnce(currentAfterFailure);
    const attemptDelivery = jest
      .fn()
      .mockRejectedValue(new Error('db unavailable after Bitrix accepted'));
    const { logger, errorMock } = buildLogger();

    const service = new ClientLeadsAdminService(
      { claimForDelivery, findById } as never,
      { attemptDelivery } as never,
      logger,
    );

    const result = await service.retry(1);

    expect(result.id).toBe(1);
    expect(errorMock).toHaveBeenCalledTimes(1);
  });

  it('успешная доставка возвращает обновлённый лид, не трогая логгер', async () => {
    const claimed = buildLead({ status: LeadDeliveryStatus.SENDING });
    const delivered = buildLead({ status: LeadDeliveryStatus.SENT });
    const claimForDelivery = jest.fn().mockResolvedValue(claimed);
    const attemptDelivery = jest.fn().mockResolvedValue(delivered);
    const { logger, errorMock } = buildLogger();

    const service = new ClientLeadsAdminService(
      { claimForDelivery, findById: jest.fn() } as never,
      { attemptDelivery } as never,
      logger,
    );

    const result = await service.retry(1);

    expect(result.id).toBe(1);
    expect(errorMock).not.toHaveBeenCalled();
  });
});

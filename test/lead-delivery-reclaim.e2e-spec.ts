import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { StartedTestContainer } from 'testcontainers';
import { Repository } from 'typeorm';
import { BitrixClient } from '../src/modules/clients/application/bitrix-client';
import { LeadDeliveryScheduler } from '../src/modules/clients/application/lead-delivery.scheduler';
import { ClientLead } from '../src/modules/clients/domain/client-lead.entity';
import { ClientLeadType } from '../src/modules/clients/enums/client-lead-type.enum';
import { LeadDeliveryStatus } from '../src/modules/clients/enums/lead-delivery-status.enum';
import { ClientLeadsRepository } from '../src/modules/clients/infrastructure/client-leads.repository';
import { runTestMigrations, startTestDatabase } from './support/test-database';

const MAX_SENDING_RECLAIMS = 3;
const STUCK_SENDING_TIMEOUT_MS = 2 * 60 * 1000;

function staleDate(): Date {
  return new Date(Date.now() - STUCK_SENDING_TIMEOUT_MS - 1000);
}

// Bitrix принимает лид с первой попытки на каждом тике (behavior отсутствует намеренно) — тест
// ниже изолирует ровно сценарий N-2 («доставлено, но не записано»), не «Bitrix недоступен»
// (это уже покрыто test/leads.e2e-spec.ts::MockBitrixClient).
class MockBitrixClient {
  calls = 0;

  sendLead(): Promise<{
    bitrixLeadId: string;
    response: Record<string, unknown>;
  }> {
    this.calls += 1;
    return Promise.resolve({
      bitrixLeadId: `mock-${this.calls}`,
      response: { result: this.calls },
    });
  }
}

// N-2 (round-3 review): без верхней границы реклейм зависшего SENDING по таймауту безусловен —
// при детерминированном (не транзиентном) сбое markSent это даёт бесконечный цикл claim → POST в
// Bitrix → сбой записи → claim по таймауту → новый POST, без предела на число дублей лида в CRM.
// Против реального Postgres (не мока), потому что граница живёт в атомарном UPDATE с
// CASE-выражением на уровне репозитория — ровно то место, где легко ошибиться молча.
describe('Lead delivery reclaim bound (e2e)', () => {
  let app: INestApplication;
  let postgres: StartedTestContainer;
  let clientLeadsRepository: ClientLeadsRepository;
  let leadRepo: Repository<ClientLead>;
  let scheduler: LeadDeliveryScheduler;
  let mockBitrixClient: MockBitrixClient;

  beforeAll(async () => {
    postgres = await startTestDatabase();
    await runTestMigrations();

    const { AppModule } =
      require('../src/app.module') as typeof import('../src/app.module');

    mockBitrixClient = new MockBitrixClient();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BitrixClient)
      .useValue(mockBitrixClient)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    clientLeadsRepository = moduleRef.get(ClientLeadsRepository);
    leadRepo = moduleRef.get(getRepositoryToken(ClientLead));
    scheduler = moduleRef.get(LeadDeliveryScheduler);
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await postgres.stop();
  });

  async function seedLead(overrides: Partial<ClientLead>): Promise<ClientLead> {
    const { clientId: baseClientId } = await clientLeadsRepository.submitLead({
      type: ClientLeadType.PARTNER,
      name: 'Тест Реклейм',
      phoneRaw: `7999${Math.floor(Math.random() * 1e7)}`,
      emailRaw: null,
      message: null,
      comment: null,
      utm: null,
      payload: {},
      bitrixPayload: {},
    });
    const lead = await leadRepo.findOneByOrFail({ clientId: baseClientId });
    return leadRepo.save({ ...lead, ...overrides });
  }

  it('реклейм останавливается на MAX_SENDING_RECLAIMS, дальше claimForDelivery не подбирает', async () => {
    const lead = await seedLead({
      status: LeadDeliveryStatus.SENDING,
      sendingAt: staleDate(),
      sendingReclaimCount: MAX_SENDING_RECLAIMS - 1, // одного реклейма не хватает до предела
    });

    const claimed = await clientLeadsRepository.claimForDelivery(lead.id);
    expect(claimed?.sendingReclaimCount).toBe(MAX_SENDING_RECLAIMS);
    expect(claimed?.status).toBe(LeadDeliveryStatus.SENDING);

    // Зависла снова, но счётчик уже на пределе — дальше не подбирается автоматическим реклеймом.
    await leadRepo.update(lead.id, { sendingAt: staleDate() });
    const refused = await clientLeadsRepository.claimForDelivery(lead.id);
    expect(refused).toBeNull();
  });

  it('свежий claim из PENDING не наследует чужой счётчик реклеймов', async () => {
    const lead = await seedLead({
      status: LeadDeliveryStatus.PENDING,
      sendingReclaimCount: MAX_SENDING_RECLAIMS, // не должно иметь значения для PENDING → SENDING
    });

    const claimed = await clientLeadsRepository.claimForDelivery(lead.id);

    expect(claimed?.status).toBe(LeadDeliveryStatus.SENDING);
    expect(claimed?.sendingReclaimCount).toBe(MAX_SENDING_RECLAIMS); // не тронут, не инкрементирован
  });

  it('failStuckDeliveries не трогает SENDING раньше STUCK_SENDING_TIMEOUT_MS, даже на пределе счётчика', async () => {
    const lead = await seedLead({
      status: LeadDeliveryStatus.SENDING,
      sendingAt: new Date(), // свежий claim, ещё может быть в процессе реального HTTP-вызова
      sendingReclaimCount: MAX_SENDING_RECLAIMS,
    });

    // failStuckDeliveries — массовый UPDATE по всей таблице, не по одному id: не проверяем
    // общий affected (другие тесты этого файла намеренно оставляют в общей тестовой БД свои
    // зависшие лиды) — только состояние конкретно этого лида.
    await clientLeadsRepository.failStuckDeliveries();

    const reloaded = await leadRepo.findOneByOrFail({ id: lead.id });
    expect(reloaded.status).toBe(LeadDeliveryStatus.SENDING);
  });

  it('failStuckDeliveries переводит исчерпавший реклеймы SENDING в видимый FAILED', async () => {
    const lead = await seedLead({
      status: LeadDeliveryStatus.SENDING,
      sendingAt: staleDate(),
      sendingReclaimCount: MAX_SENDING_RECLAIMS,
    });

    const affected = await clientLeadsRepository.failStuckDeliveries();

    const reloaded = await leadRepo.findOneByOrFail({ id: lead.id });
    expect(affected).toBeGreaterThanOrEqual(1);
    expect(reloaded.status).toBe(LeadDeliveryStatus.FAILED);
    expect(reloaded.bitrixError).toContain('зависла в SENDING');

    // Терминальный, но не потерянный: ручной retry из админки всё ещё может его подобрать.
    const manualRetryClaim = await clientLeadsRepository.claimForDelivery(
      lead.id,
    );
    expect(manualRetryClaim?.status).toBe(LeadDeliveryStatus.SENDING);
  });

  // N-2, полный сценарий из «чем проверить» (round-3 review): markSent падает ВСЕГДА
  // (детерминированный, не транзиентный сбой записи — не сбой самого Bitrix, тот выше уже
  // отвечает успехом на каждой попытке), несколько тиков шедулера подряд. Без границы это был бы
  // POST в Bitrix на каждый реклейм без предела. sendingAt между тиками переводится в прошлое
  // напрямую в БД (а не реальным ожиданием 2 минут x несколько раз) — тот же приём, что в
  // остальных тестах файла (staleDate()), тик шедулера от этого не отличим от настоящего.
  it('полный цикл шедулера с всегда падающим markSent: POST в Bitrix ограничен сверху, финальный статус — видимый FAILED, не SENDING', async () => {
    const lead = await seedLead({ status: LeadDeliveryStatus.PENDING });
    const callsBefore = mockBitrixClient.calls;

    const markSentSpy = jest
      .spyOn(clientLeadsRepository, 'markSent')
      .mockRejectedValue(
        new Error('деterministic write failure (test double)'),
      );

    try {
      // Тик 1: claim из PENDING (свежий, count остаётся 0) -> sendLead #1 -> markSent падает
      // MARK_SENT_RETRY_ATTEMPTS раз подряд -> лид остаётся в SENDING.
      await scheduler.run();

      // MAX_SENDING_RECLAIMS тиков-реклеймов: каждый добавляет 1 к sendingReclaimCount и даёт ещё
      // один POST в Bitrix, пока счётчик не упрётся в предел.
      for (let i = 0; i < MAX_SENDING_RECLAIMS; i++) {
        await leadRepo.update(lead.id, { sendingAt: staleDate() });
        await scheduler.run();
      }

      // Финальный тик: claimForDelivery больше не подбирает (count === MAX_SENDING_RECLAIMS),
      // но failStuckDeliveries() (вызывается шедулером до findDueForDelivery) переводит лид в
      // видимый FAILED — без нового POST.
      await leadRepo.update(lead.id, { sendingAt: staleDate() });
      await scheduler.run();

      expect(mockBitrixClient.calls - callsBefore).toBe(
        MAX_SENDING_RECLAIMS + 1,
      );

      const final = await leadRepo.findOneByOrFail({ id: lead.id });
      expect(final.status).toBe(LeadDeliveryStatus.FAILED);
      expect(final.status).not.toBe(LeadDeliveryStatus.SENDING);
      expect(final.bitrixError).toContain('зависла в SENDING');

      // Ещё один тик поверх уже терминального FAILED не должен подбирать лид сам (не due —
      // FAILED без nextRetryAt не входит ни в одну ветку findDueForDelivery) и не должен слать
      // очередной POST.
      await scheduler.run();
      expect(mockBitrixClient.calls - callsBefore).toBe(
        MAX_SENDING_RECLAIMS + 1,
      );
    } finally {
      markSentSpy.mockRestore();
    }
  });
});

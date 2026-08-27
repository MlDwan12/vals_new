import { BadRequestException, INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { StartedTestContainer } from 'testcontainers';
import { Repository } from 'typeorm';
import { Tariff } from '../src/modules/tariffs/domain/tariff.entity';
import { TariffPeriod } from '../src/modules/tariff-periods/domain/tariff-period.entity';
import { TariffPeriodsRepository } from '../src/modules/tariff-periods/infrastructure/tariff-periods.repository';
import { TariffPeriodsService } from '../src/modules/tariff-periods/application/tariff-periods.service';
import { runTestMigrations, startTestDatabase } from './support/test-database';

// Б5 (независимый аудит 2026-08-21): TariffPeriodsRepository.remove() не проверял, используется ли
// период хотя бы в одном тарифе (billing_cycles — jsonb-снапшот, без FK на tariff_periods).
// tariffs.service.spec.ts/tariff-periods.service.spec.ts проверяют это на моках — здесь отдельно
// проверяется сам JSONB-запрос (TariffsRepository.existsByPeriodId) против реального Postgres,
// который на моках не воспроизводится.
describe('Tariff period delete guard (e2e)', () => {
  let app: INestApplication;
  let postgres: StartedTestContainer;
  let tariffPeriodsService: TariffPeriodsService;
  let tariffPeriodsRepository: TariffPeriodsRepository;
  let tariffRepo: Repository<Tariff>;

  beforeAll(async () => {
    postgres = await startTestDatabase();
    await runTestMigrations();

    // Отложенная загрузка только для AppModule — см. комментарий в auth.e2e-spec.ts.
    const { AppModule } =
      require('../src/app.module') as typeof import('../src/app.module');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    tariffPeriodsService = moduleRef.get(TariffPeriodsService);
    tariffPeriodsRepository = moduleRef.get(TariffPeriodsRepository);
    tariffRepo = moduleRef.get(getRepositoryToken(Tariff));
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await postgres.stop();
  });

  async function createPeriod(months: number): Promise<TariffPeriod> {
    return tariffPeriodsRepository.create({ months, discountPercent: null });
  }

  // Тариф создаётся напрямую через репозиторий (не через TariffsService.create(), который требует
  // реальный Service — не нужен для проверки самого JSONB-запроса на billing_cycles).
  async function createTariffReferencingPeriod(
    periodId: number,
  ): Promise<Tariff> {
    return tariffRepo.save(
      tariffRepo.create({
        service: null,
        serviceId: null,
        name: 'Тест',
        from: 'от 1000 руб',
        features: '',
        isPopular: false,
        basePrice: 1000,
        orderIndex: 0,
        billingCycles: [
          {
            periodId,
            monthCount: 3,
            pricePerMonth: 1000,
            discountPercent: null,
            totalPrice: 3000,
          },
        ],
      }),
    );
  }

  it('отклоняет удаление периода, используемого в тарифе', async () => {
    const period = await createPeriod(3);
    const tariff = await createTariffReferencingPeriod(period.id);

    await expect(tariffPeriodsService.remove(period.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    expect(await tariffPeriodsRepository.findById(period.id)).not.toBeNull();

    // Уборка, чтобы не мешать следующему it (одна тестовая БД на весь файл).
    await tariffRepo.delete(tariff.id);
  });

  it('удаляет период после того, как ссылающийся тариф на него больше не смотрит', async () => {
    const period = await createPeriod(6);
    const tariff = await createTariffReferencingPeriod(period.id);

    await expect(tariffPeriodsService.remove(period.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    await tariffRepo.delete(tariff.id);

    await tariffPeriodsService.remove(period.id);
    expect(await tariffPeriodsRepository.findById(period.id)).toBeNull();
  });

  it('удаляет период, который никогда не использовался ни в одном тарифе', async () => {
    const period = await createPeriod(12);

    await tariffPeriodsService.remove(period.id);
    expect(await tariffPeriodsRepository.findById(period.id)).toBeNull();
  });
});

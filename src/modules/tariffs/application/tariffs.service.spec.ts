import { Service } from '../../services/domain/service.entity';
import { ServicesRepository } from '../../services/infrastructure/services.repository';
import { TariffPeriod } from '../../tariff-periods/domain/tariff-period.entity';
import { TariffPeriodsRepository } from '../../tariff-periods/infrastructure/tariff-periods.repository';
import { Tariff } from '../domain/tariff.entity';
import { TariffsRepository } from '../infrastructure/tariffs.repository';
import { TariffsService } from './tariffs.service';

function buildRepositories(): {
  tariffsRepository: jest.Mocked<TariffsRepository>;
  servicesRepository: jest.Mocked<ServicesRepository>;
  tariffPeriodsRepository: jest.Mocked<TariffPeriodsRepository>;
} {
  const tariffsRepository = {
    create: jest.fn((data) => data as Tariff),
    save: jest.fn((tariff) => Promise.resolve(tariff as Tariff)),
    findById: jest.fn(),
    findAndCount: jest.fn(),
    findByIdWithService: jest.fn(),
    remove: jest.fn(),
  } as unknown as jest.Mocked<TariffsRepository>;

  const servicesRepository = {
    findByIds: jest.fn().mockResolvedValue([{ id: 1 } as Service]),
  } as unknown as jest.Mocked<ServicesRepository>;

  const tariffPeriodsRepository = {
    findByIds: jest.fn(),
  } as unknown as jest.Mocked<TariffPeriodsRepository>;

  return { tariffsRepository, servicesRepository, tariffPeriodsRepository };
}

function buildPeriod(overrides: Partial<TariffPeriod> = {}): TariffPeriod {
  return { id: 1, months: 1, discountPercent: null, ...overrides };
}

// Б3/Б4 (независимый аудит 2026-08-21): buildBillingCycles считалась без округления и с особым
// случаем для months:1, из-за которого discountPercent в ответе мог противоречить pricePerMonth.
describe('TariffsService — buildBillingCycles (через create())', () => {
  it('округляет pricePerMonth до целого рубля (Б3)', async () => {
    const { tariffsRepository, servicesRepository, tariffPeriodsRepository } =
      buildRepositories();
    tariffPeriodsRepository.findByIds.mockResolvedValue([
      buildPeriod({ id: 5, months: 3, discountPercent: 33 }),
    ]);
    const service = new TariffsService(
      tariffsRepository,
      servicesRepository,
      tariffPeriodsRepository,
    );

    await service.create({
      serviceId: 1,
      name: 'Стандарт',
      from: 'от',
      features: '',
      basePrice: 999,
      periodIds: [5],
    });

    const saved = tariffsRepository.save.mock.calls[0][0];
    // 999 * (1 - 33/100) = 669.33 -> округляется до 669, не 669.3299999999999.
    expect(saved.billingCycles[0].pricePerMonth).toBe(669);
    expect(saved.billingCycles[0].totalPrice).toBe(669 * 3);
  });

  it('months:1 без скидки — pricePerMonth равен basePrice без искажений (Б4)', async () => {
    const { tariffsRepository, servicesRepository, tariffPeriodsRepository } =
      buildRepositories();
    tariffPeriodsRepository.findByIds.mockResolvedValue([
      buildPeriod({ id: 7, months: 1, discountPercent: null }),
    ]);
    const service = new TariffsService(
      tariffsRepository,
      servicesRepository,
      tariffPeriodsRepository,
    );

    await service.create({
      serviceId: 1,
      name: 'Стандарт',
      from: 'от',
      features: '',
      basePrice: 1000,
      periodIds: [7],
    });

    const saved = tariffsRepository.save.mock.calls[0][0];
    expect(saved.billingCycles[0]).toMatchObject({
      pricePerMonth: 1000,
      discountPercent: null,
      totalPrice: 1000,
    });
  });
});

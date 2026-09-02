import { BadRequestException } from '@nestjs/common';
import { TariffsRepository } from '../../tariffs/infrastructure/tariffs.repository';
import { TariffPeriod } from '../domain/tariff-period.entity';
import { TariffPeriodsRepository } from '../infrastructure/tariff-periods.repository';
import { TariffPeriodsService } from './tariff-periods.service';

function buildPeriod(overrides: Partial<TariffPeriod> = {}): TariffPeriod {
  return { id: 1, months: 1, discountPercent: null, ...overrides };
}

// createMock/updateMock/removeMock — отдельные переменные, не repo.create/repo.update/repo.remove
// (@typescript-eslint/unbound-method: голая ссылка на метод объекта, переданная в expect(),
// теряет привязку this — тот же приём, что в tags.service.spec.ts).
function buildRepositories(): {
  repo: jest.Mocked<TariffPeriodsRepository>;
  tariffsRepo: jest.Mocked<TariffsRepository>;
  createMock: jest.Mock;
  updateMock: jest.Mock;
  removeMock: jest.Mock;
} {
  const createMock = jest.fn((data) => Promise.resolve(buildPeriod(data)));
  const updateMock = jest.fn();
  const removeMock = jest.fn();
  const repo = {
    create: createMock,
    update: updateMock,
    remove: removeMock,
    findById: jest.fn(),
    findAll: jest.fn(),
    findAndCount: jest.fn(),
    // Без реальной транзакции/лока в юните — просто прогоняет переданный колбэк, как и было бы в
    // проде при отсутствии конкурента на advisory-лок.
    withMutationLock: jest.fn((fn: () => unknown) => fn()),
  } as unknown as jest.Mocked<TariffPeriodsRepository>;
  const tariffsRepo = {
    existsByPeriodId: jest.fn().mockResolvedValue(false),
  } as unknown as jest.Mocked<TariffsRepository>;
  return { repo, tariffsRepo, createMock, updateMock, removeMock };
}

// Б4 (независимый аудит 2026-08-21): скидка на период с months:1 давала внутренне противоречивый
// ответ у TariffsService (discountPercent > 0, но pricePerMonth без изменений).
describe('TariffPeriodsService — запрет скидки на months:1', () => {
  it('create() отклоняет months:1 с ненулевой скидкой', async () => {
    const { repo, tariffsRepo, createMock } = buildRepositories();
    const service = new TariffPeriodsService(repo, tariffsRepo);

    await expect(
      service.create({ months: 1, discountPercent: 10 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('create() пропускает months:1 без скидки', async () => {
    const { repo, tariffsRepo } = buildRepositories();
    const service = new TariffPeriodsService(repo, tariffsRepo);

    await expect(service.create({ months: 1 })).resolves.toMatchObject({
      months: 1,
      discountPercent: null,
    });
  });

  it('create() пропускает months > 1 со скидкой', async () => {
    const { repo, tariffsRepo } = buildRepositories();
    const service = new TariffPeriodsService(repo, tariffsRepo);

    await expect(
      service.create({ months: 3, discountPercent: 15 }),
    ).resolves.toMatchObject({ months: 3, discountPercent: 15 });
  });

  it('update() отклоняет добавление скидки к уже существующему months:1', async () => {
    const { repo, tariffsRepo, updateMock } = buildRepositories();
    repo.findById.mockResolvedValue(buildPeriod({ id: 9, months: 1 }));
    const service = new TariffPeriodsService(repo, tariffsRepo);

    await expect(
      service.update(9, { discountPercent: 5 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('update() отклоняет смену months на 1 у периода с уже существующей скидкой', async () => {
    const { repo, tariffsRepo, updateMock } = buildRepositories();
    repo.findById.mockResolvedValue(
      buildPeriod({ id: 9, months: 3, discountPercent: 10 }),
    );
    const service = new TariffPeriodsService(repo, tariffsRepo);

    await expect(service.update(9, { months: 1 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(updateMock).not.toHaveBeenCalled();
  });
});

// Б5 (независимый аудит 2026-08-21): remove() не проверял, используется ли период хотя бы в одном
// тарифе (billing_cycles — jsonb-снапшот, не FK) — удаление такого периода не падало сразу, а
// стреляло позже непонятной 400 при следующем пересчёте billingCycles тарифа.
describe('TariffPeriodsService — запрет удаления используемого периода (Б5)', () => {
  it('remove() отклоняет период, используемый хотя бы в одном тарифе', async () => {
    const { repo, tariffsRepo, removeMock } = buildRepositories();
    repo.findById.mockResolvedValue(buildPeriod({ id: 9 }));
    tariffsRepo.existsByPeriodId.mockResolvedValue(true);
    const service = new TariffPeriodsService(repo, tariffsRepo);

    await expect(service.remove(9)).rejects.toBeInstanceOf(BadRequestException);
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('remove() удаляет период, не используемый ни в одном тарифе', async () => {
    const { repo, tariffsRepo, removeMock } = buildRepositories();
    repo.findById.mockResolvedValue(buildPeriod({ id: 9 }));
    tariffsRepo.existsByPeriodId.mockResolvedValue(false);
    const service = new TariffPeriodsService(repo, tariffsRepo);

    await service.remove(9);
    expect(removeMock).toHaveBeenCalledWith(9);
  });
});

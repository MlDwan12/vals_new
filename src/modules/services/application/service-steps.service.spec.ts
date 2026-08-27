import { ConflictException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { Service } from '../domain/service.entity';
import { ServiceStep } from '../domain/service-step.entity';
import { ServicesRepository } from '../infrastructure/services.repository';
import { ServiceStepsRepository } from '../infrastructure/service-steps.repository';
import { ServiceStepsService } from './service-steps.service';

class FakeDriverError extends Error {
  code?: string;
}

function uniqueViolation(): QueryFailedError {
  const driverError = new FakeDriverError('duplicate key value');
  Object.assign(driverError, { code: '23505' });
  return new QueryFailedError(
    'INSERT INTO "service_steps" ...',
    [],
    driverError,
  );
}

function buildStep(overrides: Partial<ServiceStep> = {}): ServiceStep {
  return {
    id: 1,
    step: 1,
    title: 'Заявка',
    description: '',
    time: null,
    serviceId: 1,
    ...overrides,
  } as ServiceStep;
}

// createMock/updateMock — отдельные переменные, не repo.create/repo.update
// (@typescript-eslint/unbound-method — тот же приём, что в tags.service.spec.ts).
function buildRepositories(): {
  serviceStepsRepository: jest.Mocked<ServiceStepsRepository>;
  servicesRepository: jest.Mocked<ServicesRepository>;
  createMock: jest.Mock;
  updateMock: jest.Mock;
} {
  const createMock = jest.fn();
  const updateMock = jest.fn();
  const serviceStepsRepository = {
    create: createMock,
    update: updateMock,
    findById: jest.fn(),
    findAndCount: jest.fn(),
    remove: jest.fn(),
  } as unknown as jest.Mocked<ServiceStepsRepository>;
  const servicesRepository = {
    findByIds: jest.fn().mockResolvedValue([{ id: 1 } as Service]),
  } as unknown as jest.Mocked<ServicesRepository>;
  return { serviceStepsRepository, servicesRepository, createMock, updateMock };
}

// Б6 (независимый аудит 2026-08-21): UNIQUE(service_id, step) — единственное место в
// content-модулях без обработки конфликта, переупорядочивание шагов (swap двух шагов) давало
// сырой 500 вместо понятного 4xx.
describe('ServiceStepsService — конфликт unique(service_id, step)', () => {
  it('create() превращает unique-violation в ConflictException', async () => {
    const { serviceStepsRepository, servicesRepository, createMock } =
      buildRepositories();
    createMock.mockRejectedValue(uniqueViolation());
    const service = new ServiceStepsService(
      serviceStepsRepository,
      servicesRepository,
    );

    await expect(
      service.create({ step: 1, title: 'Т', description: '', serviceId: 1 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('update() превращает unique-violation в ConflictException', async () => {
    const { serviceStepsRepository, servicesRepository, updateMock } =
      buildRepositories();
    updateMock.mockRejectedValue(uniqueViolation());
    const service = new ServiceStepsService(
      serviceStepsRepository,
      servicesRepository,
    );

    await expect(service.update(9, { step: 2 })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('create() без конфликта проходит как обычно', async () => {
    const { serviceStepsRepository, servicesRepository, createMock } =
      buildRepositories();
    createMock.mockResolvedValue(buildStep());
    const service = new ServiceStepsService(
      serviceStepsRepository,
      servicesRepository,
    );

    await expect(
      service.create({ step: 1, title: 'Т', description: '', serviceId: 1 }),
    ).resolves.toMatchObject({ step: 1 });
  });

  it('другие ошибки не подменяются ConflictException', async () => {
    const { serviceStepsRepository, servicesRepository, createMock } =
      buildRepositories();
    createMock.mockRejectedValue(new Error('boom'));
    const service = new ServiceStepsService(
      serviceStepsRepository,
      servicesRepository,
    );

    await expect(
      service.create({ step: 1, title: 'Т', description: '', serviceId: 1 }),
    ).rejects.not.toBeInstanceOf(ConflictException);
  });

  it('update() всё ещё бросает NotFoundException для несуществующего шага', async () => {
    const { serviceStepsRepository, servicesRepository, updateMock } =
      buildRepositories();
    updateMock.mockResolvedValue(null);
    const service = new ServiceStepsService(
      serviceStepsRepository,
      servicesRepository,
    );

    await expect(service.update(404, { step: 2 })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

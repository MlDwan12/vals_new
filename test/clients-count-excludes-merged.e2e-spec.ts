import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { StartedTestContainer } from 'testcontainers';
import { Repository } from 'typeorm';
import { Client } from '../src/modules/clients/domain/client.entity';
import { ClientsRepository } from '../src/modules/clients/infrastructure/clients.repository';
import { runTestMigrations, startTestDatabase } from './support/test-database';

// Б7 (независимый аудит 2026-08-21): ClientsRepository.count() считал все строки clients,
// включая слитые дубли (isMerged: true) — счётчик дашборда систематически завышен относительно
// того, что реально видно в /admin/clients (findAndCount() уже фильтрует isMerged: false).
// Против реального Postgres, а не мока — фикс живёт в самом WHERE-условии count().
describe('ClientsRepository.count() excludes merged clients (e2e)', () => {
  let app: INestApplication;
  let postgres: StartedTestContainer;
  let clientsRepository: ClientsRepository;
  let clientRepo: Repository<Client>;

  beforeAll(async () => {
    postgres = await startTestDatabase();
    await runTestMigrations();

    const { AppModule } =
      require('../src/app.module') as typeof import('../src/app.module');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    clientsRepository = moduleRef.get(ClientsRepository);
    clientRepo = moduleRef.get(getRepositoryToken(Client));
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await postgres.stop();
  });

  it('не считает клиентов с isMerged: true', async () => {
    const before = await clientsRepository.count();

    const active = await clientRepo.save(
      clientRepo.create({ primaryPhone: '79990001122', isMerged: false }),
    );
    const merged = await clientRepo.save(
      clientRepo.create({ primaryPhone: '79990001123', isMerged: false }),
    );
    await clientRepo.update(merged.id, {
      isMerged: true,
      mergedIntoClientId: active.id,
    });

    expect(await clientsRepository.count()).toBe(before + 1);
  });
});

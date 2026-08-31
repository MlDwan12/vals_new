import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { StartedTestContainer } from 'testcontainers';
import { Repository } from 'typeorm';
import { Role } from '../src/core/enums/role.enum';
import { Service } from '../src/modules/services/domain/service.entity';
import { ServiceCategory } from '../src/modules/services/domain/service-category.entity';
import { User } from '../src/modules/users/domain/user.entity';
import { createTestService } from './support/service-fixtures';
import { resolveRoleId } from './support/resolve-role-id';
import { runTestMigrations, startTestDatabase } from './support/test-database';

const ORIGIN = 'http://localhost:3001';

// EXPANSION_TASKS.md задача 9: "смотрите также" — ServiceRelation, однонаправленная связь с
// порядком (не M2M, §9 expansion-decisions.md). Проверяем CRUD через admin-роут, встраивание в
// публичный /services/info/:slug (отсортировано по order), защиту от самосвязи/несуществующей
// услуги/дублей, и CASCADE при удалении любой из двух услуг.
describe('Service relations: "смотрите также" (e2e)', () => {
  let app: INestApplication;
  let postgres: StartedTestContainer;
  let moduleRef: TestingModule;
  let users: Repository<User>;
  let services: Repository<Service>;
  let serviceCategories: Repository<ServiceCategory>;
  let contentManagerCookie: string;

  beforeAll(async () => {
    postgres = await startTestDatabase();
    await runTestMigrations();

    const { AppModule } =
      require('../src/app.module') as typeof import('../src/app.module');

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();

    users = moduleRef.get<Repository<User>>(getRepositoryToken(User));
    services = moduleRef.get<Repository<Service>>(getRepositoryToken(Service));
    serviceCategories = moduleRef.get<Repository<ServiceCategory>>(
      getRepositoryToken(ServiceCategory),
    );

    const passwordHash = await bcrypt.hash('ServiceRelationsE2e123!', 4);
    const roleId = await resolveRoleId(moduleRef, Role.CONTENT_MANAGER);
    await users.save(
      users.create({
        username: 'service-relations-e2e-content-manager',
        password: passwordHash,
        roleId,
        isActive: true,
      }),
    );
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', ORIGIN)
      .send({
        username: 'service-relations-e2e-content-manager',
        password: 'ServiceRelationsE2e123!',
      });
    expect(login.status).toBe(201);
    const raw = login.headers['set-cookie'] as unknown as string[] | undefined;
    contentManagerCookie = (raw ?? [])
      .map((cookie) => cookie.split(';')[0])
      .join('; ');
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await postgres.stop();
  });

  function agent(method: 'get' | 'post' | 'patch' | 'delete', path: string) {
    return request(app.getHttpServer())
      [method](path)
      .set('Origin', ORIGIN)
      .set('Cookie', contentManagerCookie);
  }

  function createService(slug: string): Promise<Service> {
    return createTestService(services, serviceCategories, slug);
  }

  it('создаёт, читает, правит и удаляет связь; отклоняет самосвязь и несуществующую услугу', async () => {
    const [a, b, c] = await Promise.all([
      createService('relations-a'),
      createService('relations-b'),
      createService('relations-c'),
    ]);

    const selfRelation = await agent('post', '/admin/service-relations').send({
      serviceId: a.id,
      relatedServiceId: a.id,
      order: 1,
    });
    expect(selfRelation.status).toBe(400);

    const missingService = await agent('post', '/admin/service-relations').send(
      { serviceId: a.id, relatedServiceId: 999999, order: 1 },
    );
    expect(missingService.status).toBe(400);

    const create = await agent('post', '/admin/service-relations').send({
      serviceId: a.id,
      relatedServiceId: b.id,
      order: 1,
    });
    expect(create.status).toBe(201);
    const created = (create.body as { data: { id: number } }).data;

    const read = await agent('get', `/admin/service-relations/${created.id}`);
    expect(read.status).toBe(200);
    expect(
      (read.body as { data: { relatedServiceId: number } }).data
        .relatedServiceId,
    ).toBe(b.id);

    const update = await agent(
      'patch',
      `/admin/service-relations/${created.id}`,
    ).send({ relatedServiceId: c.id });
    expect(update.status).toBe(200);
    expect(
      (update.body as { data: { relatedServiceId: number } }).data
        .relatedServiceId,
    ).toBe(c.id);

    const remove = await agent(
      'delete',
      `/admin/service-relations/${created.id}`,
    );
    expect(remove.status).toBe(204);

    const readAfterRemove = await agent(
      'get',
      `/admin/service-relations/${created.id}`,
    );
    expect(readAfterRemove.status).toBe(404);
  });

  it('дублирующая пара service+relatedService — 409', async () => {
    const [a, b] = await Promise.all([
      createService('relations-dup-pair-a'),
      createService('relations-dup-pair-b'),
    ]);

    const first = await agent('post', '/admin/service-relations').send({
      serviceId: a.id,
      relatedServiceId: b.id,
      order: 1,
    });
    expect(first.status).toBe(201);

    const duplicate = await agent('post', '/admin/service-relations').send({
      serviceId: a.id,
      relatedServiceId: b.id,
      order: 2,
    });
    expect(duplicate.status).toBe(409);
  });

  it('дублирующий order у одной услуги — 409', async () => {
    const [a, b, c] = await Promise.all([
      createService('relations-dup-order-a'),
      createService('relations-dup-order-b'),
      createService('relations-dup-order-c'),
    ]);

    const first = await agent('post', '/admin/service-relations').send({
      serviceId: a.id,
      relatedServiceId: b.id,
      order: 1,
    });
    expect(first.status).toBe(201);

    const duplicateOrder = await agent('post', '/admin/service-relations').send(
      { serviceId: a.id, relatedServiceId: c.id, order: 1 },
    );
    expect(duplicateOrder.status).toBe(409);
  });

  it('публичный /services/info/:slug отдаёт relatedServices, отсортированные по order', async () => {
    const [main, second, first] = await Promise.all([
      createService('relations-public-main'),
      createService('relations-public-second'),
      createService('relations-public-first'),
    ]);

    await agent('post', '/admin/service-relations').send({
      serviceId: main.id,
      relatedServiceId: second.id,
      order: 2,
    });
    await agent('post', '/admin/service-relations').send({
      serviceId: main.id,
      relatedServiceId: first.id,
      order: 1,
    });

    const info = await request(app.getHttpServer()).get(
      `/services/info/${main.slug}`,
    );
    expect(info.status).toBe(200);
    const relatedSlugs = (
      info.body as { data: { relatedServices: { slug: string }[] } }
    ).data.relatedServices.map((item) => item.slug);
    expect(relatedSlugs).toEqual([first.slug, second.slug]);
  });

  it('удаление услуги убирает её связи (CASCADE), не блокируется и не оставляет мусора', async () => {
    const [anchor, target] = await Promise.all([
      createService('relations-cascade-anchor'),
      createService('relations-cascade-target'),
    ]);

    const relation = await agent('post', '/admin/service-relations').send({
      serviceId: anchor.id,
      relatedServiceId: target.id,
      order: 1,
    });
    const relationId = (relation.body as { data: { id: number } }).data.id;

    const removeTarget = await agent('delete', `/admin/services/${target.id}`);
    expect(removeTarget.status).toBe(204);

    const readAfterCascade = await agent(
      'get',
      `/admin/service-relations/${relationId}`,
    );
    expect(readAfterCascade.status).toBe(404);
  });
});

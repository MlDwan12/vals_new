import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { StartedTestContainer } from 'testcontainers';
import { Repository } from 'typeorm';
import { Role } from '../src/core/enums/role.enum';
import { ServiceCategory } from '../src/modules/services/domain/service-category.entity';
import { User } from '../src/modules/users/domain/user.entity';
import { resolveRoleId } from './support/resolve-role-id';
import { runTestMigrations, startTestDatabase } from './support/test-database';

const ORIGIN = 'http://localhost:3001';

// code review (задача 9): metaTitle/metaDescription/keywords/h1 проходили DTO-валидацию, но
// ServicesService.create()/update() их не передавали дальше — ServicesRepository.create() и
// applyDefinedFields() молча отбрасывали поля (CRITICAL, пойман только реальным POST/PATCH round-
// trip, юнит-тесты DTO этого не видят). Регресс-тест — на реальном Postgres, не на моках.
describe('Мета-поля услуги сохраняются через create/update (e2e)', () => {
  let app: INestApplication;
  let postgres: StartedTestContainer;
  let users: Repository<User>;
  let serviceCategories: Repository<ServiceCategory>;
  let contentManagerCookie: string;
  let categoryId: number;

  beforeAll(async () => {
    postgres = await startTestDatabase();
    await runTestMigrations();

    const { AppModule } =
      require('../src/app.module') as typeof import('../src/app.module');

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();

    users = moduleRef.get<Repository<User>>(getRepositoryToken(User));
    serviceCategories = moduleRef.get<Repository<ServiceCategory>>(
      getRepositoryToken(ServiceCategory),
    );

    const category = await serviceCategories.save(
      serviceCategories.create({ name: 'Категория' }),
    );
    categoryId = category.id;

    const passwordHash = await bcrypt.hash('ServiceMetaE2ePass123!', 4);
    const roleId = await resolveRoleId(moduleRef, Role.CONTENT_MANAGER);
    await users.save(
      users.create({
        username: 'service-meta-e2e-content-manager',
        password: passwordHash,
        roleId,
        isActive: true,
      }),
    );
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', ORIGIN)
      .send({
        username: 'service-meta-e2e-content-manager',
        password: 'ServiceMetaE2ePass123!',
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

  function agent(method: 'post' | 'patch', path: string) {
    return request(app.getHttpServer())
      [method](path)
      .set('Origin', ORIGIN)
      .set('Cookie', contentManagerCookie);
  }

  it('POST /admin/services сохраняет мета-поля', async () => {
    const create = await agent('post', '/admin/services').send({
      slug: 'meta-create-service',
      categoryId,
      title: 'Услуга',
      description: 'Описание',
      subDescription: 'Подописание',
      icon: 'icon',
      metaTitle: 'Мета-заголовок',
      metaDescription: 'Мета-описание',
      keywords: 'услуга, тест',
      h1: 'H1 заголовок',
    });
    expect(create.status).toBe(201);
    const created = (
      create.body as {
        data: {
          metaTitle: string | null;
          metaDescription: string | null;
          keywords: string | null;
          h1: string | null;
        };
      }
    ).data;
    expect(created.metaTitle).toBe('Мета-заголовок');
    expect(created.metaDescription).toBe('Мета-описание');
    expect(created.keywords).toBe('услуга, тест');
    expect(created.h1).toBe('H1 заголовок');
  });

  it('PATCH /admin/services/:id сохраняет мета-поля', async () => {
    const create = await agent('post', '/admin/services').send({
      slug: 'meta-update-service',
      categoryId,
      title: 'Услуга',
      description: 'Описание',
      subDescription: 'Подописание',
      icon: 'icon',
    });
    const id = (create.body as { data: { id: number } }).data.id;

    const update = await agent('patch', `/admin/services/${id}`).send({
      metaTitle: 'Новый мета-заголовок',
      h1: 'Новый H1',
    });
    expect(update.status).toBe(200);
    const updated = (
      update.body as {
        data: { metaTitle: string | null; h1: string | null };
      }
    ).data;
    expect(updated.metaTitle).toBe('Новый мета-заголовок');
    expect(updated.h1).toBe('Новый H1');
  });
});

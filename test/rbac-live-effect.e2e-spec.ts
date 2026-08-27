import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { StartedTestContainer } from 'testcontainers';
import { Repository } from 'typeorm';
import { User } from '../src/modules/users/domain/user.entity';
import { resolveRoleId } from './support/resolve-role-id';
import { runTestMigrations, startTestDatabase } from './support/test-database';

const ORIGIN = 'http://localhost:3001';

function cookieHeader(response: request.Response): string {
  const raw = response.headers['set-cookie'] as unknown as string[] | undefined;
  return (raw ?? []).map((cookie) => cookie.split(';')[0]).join('; ');
}

// EXPANSION_TASKS.md §1.4, приёмка п.3 — отключение/смена роли/истечение срока действуют на
// СЛЕДУЮЩЕМ ЖЕ запросе, а не через ACCESS_TOKEN_TTL_SECONDS (15 мин): AuthGuard читает isActive/
// access_expires_at живьём из БД на каждый запрос (AuthContextService), не доверяет JWT-payload,
// который теперь несёт только id. Один и тот же (ещё не истёкший) access-токен используется до и
// после изменения — если бы роль/isActive кэшировались в токене, второй запрос всё ещё был бы 200.
describe('RBAC: отключение действует на следующем же запросе, не через TTL токена (e2e)', () => {
  let app: INestApplication;
  let postgres: StartedTestContainer;
  let users: Repository<User>;
  let moduleRef: TestingModule;

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
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await postgres.stop();
  });

  it('живой access-токен перестаёт работать сразу после isActive:false, без ожидания TTL', async () => {
    const roleId = await resolveRoleId(moduleRef, 'content_manager');
    const passwordHash = await bcrypt.hash('LiveEffectPass123!', 4);
    const user = await users.save(
      users.create({
        username: 'live-effect-target',
        password: passwordHash,
        roleId,
        isActive: true,
      }),
    );

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', ORIGIN)
      .send({ username: 'live-effect-target', password: 'LiveEffectPass123!' });
    expect(login.status).toBe(201);
    const cookie = cookieHeader(login);

    const before = await request(app.getHttpServer())
      .get('/admin/tags')
      .set('Cookie', cookie);
    expect(before.status).toBe(200);

    // Отключение "из другой сессии" — напрямую в БД, не через тот же access-токен.
    await users.update(user.id, { isActive: false });

    const after = await request(app.getHttpServer())
      .get('/admin/tags')
      .set('Cookie', cookie);
    expect(after.status).toBe(401);
  });

  it('смена роли действует на следующем же запросе тем же токеном', async () => {
    const contentManagerRoleId = await resolveRoleId(
      moduleRef,
      'content_manager',
    );
    const clientManagerRoleId = await resolveRoleId(
      moduleRef,
      'client_manager',
    );
    const passwordHash = await bcrypt.hash('RoleChangePass123!', 4);
    const user = await users.save(
      users.create({
        username: 'live-effect-rolechange',
        password: passwordHash,
        roleId: contentManagerRoleId,
        isActive: true,
      }),
    );

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', ORIGIN)
      .send({
        username: 'live-effect-rolechange',
        password: 'RoleChangePass123!',
      });
    const cookie = cookieHeader(login);

    const asContentManager = await request(app.getHttpServer())
      .get('/admin/tags')
      .set('Cookie', cookie);
    expect(asContentManager.status).toBe(200);

    await users.update(user.id, { roleId: clientManagerRoleId });

    const afterRoleChange = await request(app.getHttpServer())
      .get('/admin/tags')
      .set('Cookie', cookie);
    expect(afterRoleChange.status).toBe(403);
  });
});

import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { StartedTestContainer } from 'testcontainers';
import { Repository } from 'typeorm';
import { Role } from '../src/core/enums/role.enum';
import { User } from '../src/modules/users/domain/user.entity';
import { resolveRoleId } from './support/resolve-role-id';
import { runTestMigrations, startTestDatabase } from './support/test-database';

const ORIGIN = 'http://localhost:3001';

async function createUser(
  users: Repository<User>,
  moduleRef: TestingModule,
  data: { username: string; password: string; role: Role; isActive?: boolean },
): Promise<User> {
  const passwordHash = await bcrypt.hash(data.password, 4);
  const roleId = await resolveRoleId(moduleRef, data.role);
  return users.save(
    users.create({
      username: data.username,
      password: passwordHash,
      roleId,
      isActive: data.isActive ?? true,
    }),
  );
}

function cookieHeader(response: request.Response): string {
  const raw = response.headers['set-cookie'] as unknown as string[] | undefined;
  return (raw ?? []).map((cookie) => cookie.split(';')[0]).join('; ');
}

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let postgres: StartedTestContainer;
  let users: Repository<User>;
  let moduleRef: TestingModule;

  beforeAll(async () => {
    postgres = await startTestDatabase();
    await runTestMigrations();

    // Отложенная загрузка через require() (не import()! см. комментарий в health.e2e-spec.ts):
    // ConfigModule.forRoot() внутри AppModule читает process.env синхронно в момент вычисления
    // модуля — статический import в начале файла вычислился бы до startTestDatabase и приложение
    // подключилось бы к обычной dev-БД вместо контейнера.
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

  it('логин с неверным паролем отвечает 401', async () => {
    await createUser(users, moduleRef, {
      username: 'wrongpass',
      password: 'CorrectPass123!',
      role: Role.ADMIN,
    });

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', ORIGIN)
      .send({ username: 'wrongpass', password: 'IncorrectPass!' });

    expect(response.status).toBe(401);
  });

  it("мутация без Origin отклоняется CSRF-guard'ом", async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'anyone', password: 'whatever' });

    expect(response.status).toBe(403);
  });

  it('/auth/me без cookie отвечает 401', async () => {
    const response = await request(app.getHttpServer()).get('/auth/me');
    expect(response.status).toBe(401);
  });

  it('полный жизненный цикл: login -> me -> refresh (ротация) -> старый refresh невалиден -> logout -> refresh после logout невалиден', async () => {
    await createUser(users, moduleRef, {
      username: 'lifecycle',
      password: 'LifecyclePass123!',
      role: Role.ADMIN,
    });

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', ORIGIN)
      .send({ username: 'lifecycle', password: 'LifecyclePass123!' });

    expect(login.status).toBe(201);
    const oldCookies = cookieHeader(login);
    expect(oldCookies).toContain('accessToken=');
    expect(oldCookies).toContain('refreshToken=');

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', oldCookies);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ data: { username: 'lifecycle' } });

    const refreshed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Origin', ORIGIN)
      .set('Cookie', oldCookies);
    expect(refreshed.status).toBe(200);
    const newCookies = cookieHeader(refreshed);

    const meWithNewCookies = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', newCookies);
    expect(meWithNewCookies.status).toBe(200);

    const reuseOldRefresh = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Origin', ORIGIN)
      .set('Cookie', oldCookies);
    expect(reuseOldRefresh.status).toBe(401);

    const logout = await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Origin', ORIGIN)
      .set('Cookie', newCookies);
    expect(logout.status).toBe(200);

    const refreshAfterLogout = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Origin', ORIGIN)
      .set('Cookie', newCookies);
    expect(refreshAfterLogout.status).toBe(401);
  });

  it('повторное использование отозванного refresh гасит все сессии пользователя', async () => {
    await createUser(users, moduleRef, {
      username: 'reuse',
      password: 'ReusePass123!',
      role: Role.ADMIN,
    });

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', ORIGIN)
      .send({ username: 'reuse', password: 'ReusePass123!' });
    const firstCookies = cookieHeader(login);

    const rotated = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Origin', ORIGIN)
      .set('Cookie', firstCookies);
    const secondCookies = cookieHeader(rotated);

    // Реюз уже отозванного (первого) refresh — сигнал компрометации.
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Origin', ORIGIN)
      .set('Cookie', firstCookies);

    // Даже второй (легитимный после ротации) refresh теперь тоже не должен работать.
    const secondAfterReuse = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Origin', ORIGIN)
      .set('Cookie', secondCookies);
    expect(secondAfterReuse.status).toBe(401);
  });

  it('роли: content_manager получает 403 на /admin/users, admin — 200', async () => {
    await createUser(users, moduleRef, {
      username: 'rolecheck-admin',
      password: 'AdminPass123!',
      role: Role.ADMIN,
    });
    await createUser(users, moduleRef, {
      username: 'rolecheck-cm',
      password: 'CmPass123!',
      role: Role.CONTENT_MANAGER,
    });

    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', ORIGIN)
      .send({ username: 'rolecheck-admin', password: 'AdminPass123!' });
    const cmLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', ORIGIN)
      .send({ username: 'rolecheck-cm', password: 'CmPass123!' });

    const asAdmin = await request(app.getHttpServer())
      .get('/admin/users')
      .set('Cookie', cookieHeader(adminLogin));
    expect(asAdmin.status).toBe(200);

    const asContentManager = await request(app.getHttpServer())
      .get('/admin/users')
      .set('Cookie', cookieHeader(cmLogin));
    expect(asContentManager.status).toBe(403);
  });

  it('isActive: false блокирует refresh уже выданным токеном', async () => {
    const user = await createUser(users, moduleRef, {
      username: 'deactivated',
      password: 'DeactivatedPass123!',
      role: Role.ADMIN,
    });

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', ORIGIN)
      .send({ username: 'deactivated', password: 'DeactivatedPass123!' });
    const cookies = cookieHeader(login);

    await users.update(user.id, { isActive: false });

    const refreshAfterDeactivation = await request(app.getHttpServer())
      .post('/auth/refresh')
      .set('Origin', ORIGIN)
      .set('Cookie', cookies);
    expect(refreshAfterDeactivation.status).toBe(401);

    const loginAfterDeactivation = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', ORIGIN)
      .send({ username: 'deactivated', password: 'DeactivatedPass123!' });
    expect(loginAfterDeactivation.status).toBe(401);
  });
});

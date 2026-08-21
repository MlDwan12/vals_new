import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { StartedTestContainer } from 'testcontainers';
import { Repository } from 'typeorm';
import { Role } from '../src/core/enums/role.enum';
import { User } from '../src/modules/users/domain/user.entity';
import { runTestMigrations, startTestDatabase } from './support/test-database';

const ORIGIN = 'http://localhost:3001';

// Отдельный файл (не внутри role-matrix.e2e-spec.ts): те же POST/PATCH/DELETE-роуты нельзя
// проверить одним "GET-роут на группу" примером, как в role-matrix — у admin/users роли различаются
// ВНУТРИ одной группы контроллера (createAdmin — DEVELOPER-only, createContentManager/
// createClientManager — ADMIN_ROLES, update/remove — DEVELOPER-only), RolesGuard проверяет метаданные
// конкретного МЕТОДА, не только класса. Свой /auth/login (throttle 10/мин на IP) — свой testcontainers
// Postgres, как и в role-matrix, чтобы не делить бюджет логинов с другими e2e-файлами.
describe('UsersAdminController: роль-гейты на POST/PATCH/DELETE (e2e)', () => {
  let app: INestApplication;
  let postgres: StartedTestContainer;
  let users: Repository<User>;

  beforeAll(async () => {
    postgres = await startTestDatabase();
    await runTestMigrations();

    const { AppModule } =
      require('../src/app.module') as typeof import('../src/app.module');

    const moduleRef = await Test.createTestingModule({
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

  function cookieHeader(response: request.Response): string {
    const raw = response.headers['set-cookie'] as unknown as
      string[] | undefined;
    return (raw ?? []).map((cookie) => cookie.split(';')[0]).join('; ');
  }

  const ALL_TEST_ROLES = [
    Role.DEVELOPER,
    Role.ADMIN,
    Role.CONTENT_MANAGER,
    Role.CLIENT_MANAGER,
  ];

  const cookiesByRole = new Map<Role, string>();

  beforeAll(async () => {
    for (const role of ALL_TEST_ROLES) {
      const username = `roles-${role}`;
      const passwordHash = await bcrypt.hash('RolesPass123!', 4);
      await users.save(
        users.create({
          username,
          password: passwordHash,
          role,
          isActive: true,
        }),
      );

      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .set('Origin', ORIGIN)
        .send({ username, password: 'RolesPass123!' });
      expect(login.status).toBe(201); // сорвавшийся логин даёт пустую куку и ложный 401 ниже
      cookiesByRole.set(role, cookieHeader(login));
    }
  }, 30_000);

  let uniqueSuffix = 0;
  function uniqueUsername(prefix: string): string {
    uniqueSuffix += 1;
    return `${prefix}-${uniqueSuffix}-${Date.now()}`;
  }

  // Проверяем не только HTTP-статус, но и реально сохранённую роль в БД — иначе регрессия вида
  // «createContentManager по ошибке вызвал createWithRole(..., Role.CLIENT_MANAGER)» (перепутаны
  // соседние почти одинаковые хендлеры в users-admin.controller.ts) осталась бы незамеченной:
  // 201/403 были бы теми же, что и при правильной реализации.
  async function expectCreatedWithRole(
    path: string,
    role: Role,
    usernamePrefix: string,
    expectedAssignedRole: Role,
  ): Promise<void> {
    const username = uniqueUsername(usernamePrefix);
    const response = await request(app.getHttpServer())
      .post(path)
      .set('Origin', ORIGIN)
      .set('Cookie', cookiesByRole.get(role)!)
      .send({ username, password: 'NewPass123!' });
    expect({ role, status: response.status }).toEqual({ role, status: 201 });

    const created = await users.findOneByOrFail({ username });
    expect(created.role).toBe(expectedAssignedRole);
  }

  it('POST /admin/users/admins — только DEVELOPER, остальные 403, роль сохраняется верно', async () => {
    for (const role of ALL_TEST_ROLES) {
      if (role === Role.DEVELOPER) {
        await expectCreatedWithRole(
          '/admin/users/admins',
          role,
          'new-admin',
          Role.ADMIN,
        );
        continue;
      }
      const response = await request(app.getHttpServer())
        .post('/admin/users/admins')
        .set('Origin', ORIGIN)
        .set('Cookie', cookiesByRole.get(role)!)
        .send({
          username: uniqueUsername('new-admin'),
          password: 'NewPass123!',
        });
      expect({ role, status: response.status }).toEqual({ role, status: 403 });
    }
  });

  it('POST /admin/users/content-managers — DEVELOPER и ADMIN, остальные 403, роль сохраняется верно', async () => {
    const allowed = [Role.DEVELOPER, Role.ADMIN];
    for (const role of ALL_TEST_ROLES) {
      if (allowed.includes(role)) {
        await expectCreatedWithRole(
          '/admin/users/content-managers',
          role,
          'new-content-manager',
          Role.CONTENT_MANAGER,
        );
        continue;
      }
      const response = await request(app.getHttpServer())
        .post('/admin/users/content-managers')
        .set('Origin', ORIGIN)
        .set('Cookie', cookiesByRole.get(role)!)
        .send({
          username: uniqueUsername('new-content-manager'),
          password: 'NewPass123!',
        });
      expect({ role, status: response.status }).toEqual({ role, status: 403 });
    }
  });

  it('POST /admin/users/client-managers — DEVELOPER и ADMIN, остальные 403, роль сохраняется верно', async () => {
    const allowed = [Role.DEVELOPER, Role.ADMIN];
    for (const role of ALL_TEST_ROLES) {
      if (allowed.includes(role)) {
        await expectCreatedWithRole(
          '/admin/users/client-managers',
          role,
          'new-client-manager',
          Role.CLIENT_MANAGER,
        );
        continue;
      }
      const response = await request(app.getHttpServer())
        .post('/admin/users/client-managers')
        .set('Origin', ORIGIN)
        .set('Cookie', cookiesByRole.get(role)!)
        .send({
          username: uniqueUsername('new-client-manager'),
          password: 'NewPass123!',
        });
      expect({ role, status: response.status }).toEqual({ role, status: 403 });
    }
  });

  it('PATCH /admin/users/:id — только DEVELOPER, остальные 403 без изменения записи', async () => {
    const targetHash = await bcrypt.hash('TargetPass123!', 4);
    const target = await users.save(
      users.create({
        username: uniqueUsername('patch-target'),
        password: targetHash,
        role: Role.CONTENT_MANAGER,
        isActive: true,
      }),
    );

    const nonDeveloperRoles = ALL_TEST_ROLES.filter(
      (role) => role !== Role.DEVELOPER,
    );
    for (const role of nonDeveloperRoles) {
      const response = await request(app.getHttpServer())
        .patch(`/admin/users/${target.id}`)
        .set('Origin', ORIGIN)
        .set('Cookie', cookiesByRole.get(role)!)
        .send({ isActive: false });
      expect({ role, status: response.status }).toEqual({
        role,
        status: 403,
      });
    }

    const stillActive = await users.findOneByOrFail({ id: target.id });
    expect(stillActive.isActive).toBe(true); // ни один 403 не должен был тронуть запись

    const developerResponse = await request(app.getHttpServer())
      .patch(`/admin/users/${target.id}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookiesByRole.get(Role.DEVELOPER)!)
      .send({ isActive: false });
    expect(developerResponse.status).toBe(200);
    // Глобальный ResponseInterceptor оборачивает тело в {success, status, data} — как и везде в
    // проекте (см. audit-logs.e2e-spec.ts), сырой .body не содержит полей DTO напрямую.
    const patchedBody = developerResponse.body as {
      data: { isActive: boolean };
    };
    expect(patchedBody.data.isActive).toBe(false);
  });

  it('DELETE /admin/users/:id — только DEVELOPER, остальные 403 без удаления записи', async () => {
    const targetHash = await bcrypt.hash('TargetPass123!', 4);
    const target = await users.save(
      users.create({
        username: uniqueUsername('delete-target'),
        password: targetHash,
        role: Role.CONTENT_MANAGER,
        isActive: true,
      }),
    );

    const nonDeveloperRoles = ALL_TEST_ROLES.filter(
      (role) => role !== Role.DEVELOPER,
    );
    for (const role of nonDeveloperRoles) {
      const response = await request(app.getHttpServer())
        .delete(`/admin/users/${target.id}`)
        .set('Origin', ORIGIN)
        .set('Cookie', cookiesByRole.get(role)!);
      expect({ role, status: response.status }).toEqual({
        role,
        status: 403,
      });
    }

    const stillThere = await users.findOneBy({ id: target.id });
    expect(stillThere).not.toBeNull(); // ни один 403 не должен был удалить запись

    const developerResponse = await request(app.getHttpServer())
      .delete(`/admin/users/${target.id}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookiesByRole.get(Role.DEVELOPER)!);
    expect(developerResponse.status).toBe(204);

    const afterDelete = await users.findOneBy({ id: target.id });
    expect(afterDelete).toBeNull();
  });
});

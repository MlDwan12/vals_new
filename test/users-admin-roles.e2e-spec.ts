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

// Отдельный файл (не внутри role-matrix.e2e-spec.ts): role-matrix проверяет по одному GET-роуту
// на группу, а здесь нужны мутирующие методы — гвард читает метаданные конкретного МЕТОДА, и
// регрессия «право потерялось на PATCH, но осталось на GET» там не видна. Свой /auth/login
// (throttle 10/мин на IP) — свой testcontainers Postgres, чтобы не делить бюджет логинов.
//
// Тесты трёх легаси-ручек создания (/admin/users/admins|content-managers|client-managers)
// удалены вместе с самими ручками в срезе A.4.
describe('UsersAdminController: гейты на PATCH/DELETE (e2e)', () => {
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

  // admin несёт весь реестр прав (сид AddRolesAndPermissions), в том числе users.manage;
  // developer — системная роль и проходит байпасом. У content_manager/client_manager этого
  // права нет.
  const ROLES_WITH_USERS_MANAGE = [Role.DEVELOPER, Role.ADMIN];
  const ROLES_WITHOUT_USERS_MANAGE = ALL_TEST_ROLES.filter(
    (role) => !ROLES_WITH_USERS_MANAGE.includes(role),
  );

  const cookiesByRole = new Map<Role, string>();

  beforeAll(async () => {
    for (const role of ALL_TEST_ROLES) {
      const username = `roles-${role}`;
      const passwordHash = await bcrypt.hash('RolesPass123!', 4);
      const roleId = await resolveRoleId(moduleRef, role);
      await users.save(
        users.create({
          username,
          password: passwordHash,
          roleId,
          isActive: true,
        }),
      );

      const login = await request(app.getHttpServer())
        .post('/auth/login')
        .set('Origin', ORIGIN)
        .send({ username, password: 'RolesPass123!' });
      expect(login.status).toBe(200); // сорвавшийся логин даёт пустую куку и ложный 401 ниже
      cookiesByRole.set(role, cookieHeader(login));
    }
  }, 30_000);

  let uniqueSuffix = 0;
  function uniqueUsername(prefix: string): string {
    uniqueSuffix += 1;
    return `${prefix}-${uniqueSuffix}-${Date.now()}`;
  }

  // Раньше здесь было «только DEVELOPER»: PATCH/DELETE сидели на легаси-@Roles(Role.DEVELOPER),
  // хотя соседние ручки того же контроллера (смена роли, срок доступа) давно на
  // @Perm(USERS_MANAGE). Срез A.1 убрал перекос — гейт у всех один, а цель по-прежнему защищена
  // рангом и is_system в самом сервисе (canManageTargetUser).
  it('PATCH /admin/users/:id — роли с users.manage, остальные 403 без изменения записи', async () => {
    const createTarget = async () =>
      users.save(
        users.create({
          username: uniqueUsername('patch-target'),
          password: await bcrypt.hash('TargetPass123!', 4),
          roleId: await resolveRoleId(moduleRef, Role.CONTENT_MANAGER),
          isActive: true,
        }),
      );

    const target = await createTarget();

    for (const role of ROLES_WITHOUT_USERS_MANAGE) {
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

    // Свой target на каждую разрешённую роль: иначе вторая правка шла бы по уже отключённой
    // записи и её 200 ничего не доказывал бы.
    for (const role of ROLES_WITH_USERS_MANAGE) {
      const allowedTarget =
        role === Role.DEVELOPER ? target : await createTarget();
      const response = await request(app.getHttpServer())
        .patch(`/admin/users/${allowedTarget.id}`)
        .set('Origin', ORIGIN)
        .set('Cookie', cookiesByRole.get(role)!)
        .send({ isActive: false });
      expect({ role, status: response.status }).toEqual({ role, status: 200 });
      // Глобальный ResponseInterceptor оборачивает тело в {success, status, data} — как и везде в
      // проекте (см. audit-logs.e2e-spec.ts), сырой .body не содержит полей DTO напрямую.
      const patchedBody = response.body as { data: { isActive: boolean } };
      expect(patchedBody.data.isActive).toBe(false);
    }
  });

  it('DELETE /admin/users/:id — роли с users.manage, остальные 403 без удаления записи', async () => {
    const createTarget = async () =>
      users.save(
        users.create({
          username: uniqueUsername('delete-target'),
          password: await bcrypt.hash('TargetPass123!', 4),
          roleId: await resolveRoleId(moduleRef, Role.CONTENT_MANAGER),
          isActive: true,
        }),
      );

    const target = await createTarget();

    for (const role of ROLES_WITHOUT_USERS_MANAGE) {
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

    for (const role of ROLES_WITH_USERS_MANAGE) {
      const allowedTarget =
        role === Role.DEVELOPER ? target : await createTarget();
      const response = await request(app.getHttpServer())
        .delete(`/admin/users/${allowedTarget.id}`)
        .set('Origin', ORIGIN)
        .set('Cookie', cookiesByRole.get(role)!);
      expect({ role, status: response.status }).toEqual({ role, status: 204 });
      expect(await users.findOneBy({ id: allowedTarget.id })).toBeNull();
    }
  });
});

import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { StartedTestContainer } from 'testcontainers';
import { Repository } from 'typeorm';
import {
  PERMISSIONS,
  PermissionCode,
} from '../src/core/permissions/permission.registry';
import { Permission } from '../src/modules/roles/domain/permission.entity';
import { Role as RoleEntity } from '../src/modules/roles/domain/role.entity';
import { User } from '../src/modules/users/domain/user.entity';
import { runTestMigrations, startTestDatabase } from './support/test-database';

const ORIGIN = 'http://localhost:3001';
const PASSWORD = 'CustomRolePass123!';

interface AuthProfileBody {
  data: {
    id: number;
    username: string;
    role: string;
    roleTitle: string;
    rank: number;
    isSystem: boolean;
    permissions: string[];
  };
}

// Срез A.1 (FULLSTACK_PLAN.md): роль, заведённая из панели, получала 403 на стартовом экране
// (/dashboard/stats) и в разделе пользователей (/admin/users) даже с users.manage — оба роута
// сидели на легаси-@Roles(), а он знает только 4 сидированные роли. Плюс /auth/me отдавал
// {username, role}, чего фронту не хватает, чтобы построить гейт. Отдельный файл (не внутри
// role-matrix): свой /auth/login троттлится 10/мин на IP, а бюджет логинов role-matrix уже
// выбран почти целиком — свой testcontainers-Postgres даёт чистый счётчик.
describe('Роль, заведённая из панели: доступ к экранам панели и профиль /auth/me (e2e)', () => {
  let app: INestApplication;
  let postgres: StartedTestContainer;
  let users: Repository<User>;
  let roles: Repository<RoleEntity>;
  let permissions: Repository<Permission>;
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
    roles = moduleRef.get<Repository<RoleEntity>>(
      getRepositoryToken(RoleEntity),
    );
    permissions = moduleRef.get<Repository<Permission>>(
      getRepositoryToken(Permission),
    );
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

  async function createRole(
    codePrefix: string,
    permissionCodes: PermissionCode[],
    options: { rank?: number; isSystem?: boolean } = {},
  ): Promise<RoleEntity> {
    const rolePermissions = await Promise.all(
      permissionCodes.map((permissionCode) =>
        permissions.findOneByOrFail({ code: permissionCode }),
      ),
    );
    return roles.save(
      roles.create({
        code: `${codePrefix}-${Date.now()}`,
        title: 'Тестовая роль, заведённая из панели',
        description: null,
        rank: options.rank ?? 10,
        isSystem: options.isSystem ?? false,
        permissions: rolePermissions,
      }),
    );
  }

  async function loginAs(
    username: string,
    role: RoleEntity,
  ): Promise<{ cookie: string; login: request.Response }> {
    await users.save(
      users.create({
        username,
        password: await bcrypt.hash(PASSWORD, 4),
        roleId: role.id,
        isActive: true,
      }),
    );
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', ORIGIN)
      .send({ username, password: PASSWORD });
    expect(login.status).toBe(200); // сорвавшийся логин дал бы пустую куку и ложный 401 ниже
    return { cookie: cookieHeader(login), login };
  }

  async function statusesOf(
    cookie: string,
    paths: string[],
  ): Promise<Record<string, number>> {
    const responses = await Promise.all(
      paths.map((path) =>
        request(app.getHttpServer()).get(path).set('Cookie', cookie),
      ),
    );
    return Object.fromEntries(
      paths.map((path, index) => [path, responses[index].status]),
    );
  }

  // Ровно тот прогон, которым дыра была найдена (FULLSTACK_PLAN.md, срез A): до правки
  // /dashboard/stats и /admin/users отвечали 403, а /admin/users/expiring — 200, хотя право
  // у последних двух одно и то же.
  it('роль с users.manage: стартовый экран и раздел пользователей открыты целиком', async () => {
    const role = await createRole('panel-role-users-manage', [
      PERMISSIONS.ARTICLES_READ,
      PERMISSIONS.NEWS_READ,
      PERMISSIONS.USERS_MANAGE,
    ]);
    const { cookie } = await loginAs('panel-users-manage', role);

    await expect(
      statusesOf(cookie, [
        '/auth/me',
        '/dashboard/stats',
        '/admin/articles',
        '/admin/news',
        '/admin/users',
        '/admin/users/expiring',
      ]),
    ).resolves.toEqual({
      '/auth/me': 200,
      '/dashboard/stats': 200,
      '/admin/articles': 200,
      '/admin/news': 200,
      '/admin/users': 200,
      '/admin/users/expiring': 200,
    });
  });

  // Обратная сторона того же: снятие @Roles() с дашборда не должно открыть чужие разделы.
  it('роль без users.manage: дашборд открыт, раздел пользователей — 403', async () => {
    const role = await createRole('panel-role-read-only', [
      PERMISSIONS.ARTICLES_READ,
    ]);
    const { cookie } = await loginAs('panel-read-only', role);

    await expect(
      statusesOf(cookie, [
        '/dashboard/stats',
        '/admin/articles',
        '/admin/news',
        '/admin/users',
        '/admin/users/expiring',
      ]),
    ).resolves.toEqual({
      '/dashboard/stats': 200,
      '/admin/articles': 200,
      '/admin/news': 403,
      '/admin/users': 403,
      '/admin/users/expiring': 403,
    });
  });

  it('/auth/me отдаёт коды прав, ранг и is_system, а /auth/login — тот же профиль', async () => {
    const role = await createRole(
      'panel-role-profile',
      [PERMISSIONS.NEWS_READ, PERMISSIONS.ARTICLES_READ],
      { rank: 25 },
    );
    const { cookie, login } = await loginAs('panel-profile', role);

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', cookie);
    expect(me.status).toBe(200);

    const profile = (me.body as AuthProfileBody).data;
    expect(profile).toEqual({
      id: expect.any(Number) as number,
      username: 'panel-profile',
      role: role.code,
      roleTitle: 'Тестовая роль, заведённая из панели',
      rank: 25,
      isSystem: false,
      // Отсортированы — порядок role_permissions ничего не значит, а стабильное тело удобнее
      // сравнивать и фронту, и тестам.
      permissions: ['articles.read', 'news.read'],
    });

    // Админка кладёт ответ логина прямо в стор: разойдись он с /auth/me — до первой перезагрузки
    // страницы гейт строился бы на другом наборе прав.
    expect((login.body as AuthProfileBody).data).toEqual(profile);
  });

  // is_system — байпас @Perm() с намеренно пустыми role_permissions (EXPANSION_TASKS.md §1.1):
  // прочитай фронт только permissions — владелец увидел бы пустое меню при полном доступе,
  // поэтому флаг обязан быть в профиле.
  it('системная роль: permissions пусты, isSystem true, доступ ко всем разделам', async () => {
    const role = await createRole('panel-role-system', [], {
      rank: 90,
      isSystem: true,
    });
    const { cookie } = await loginAs('panel-system', role);

    const me = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Cookie', cookie);
    const profile = (me.body as AuthProfileBody).data;
    expect(profile.isSystem).toBe(true);
    expect(profile.permissions).toEqual([]);

    await expect(
      statusesOf(cookie, ['/dashboard/stats', '/admin/users', '/admin/news']),
    ).resolves.toEqual({
      '/dashboard/stats': 200,
      '/admin/users': 200,
      '/admin/news': 200,
    });
  });

  // Экран «Пользователи» должен уметь менять роль сотрудника, имея одно лишь users.manage —
  // /admin/roles для этого не годится (он закрыт правом roles.manage). Отдельная ручка отдаёт
  // не весь список, а только то, что этот актёр вправе назначить (canAssignRole), — ровно то,
  // что попадёт в выпадающий список в панели (FULLSTACK_PLAN.md, срез A.4).
  it('assignable-roles: только роли не выше своего ранга, без системных и без чужих прав', async () => {
    const hrRole = await createRole(
      'panel-role-hr',
      [PERMISSIONS.USERS_MANAGE],
      { rank: 20 },
    );
    // Ранг ниже, но право чужое — в список попасть не должна.
    const foreignRole = await createRole(
      'panel-role-foreign-perm',
      [PERMISSIONS.CLIENTS_READ],
      { rank: 5 },
    );
    const { cookie } = await loginAs('panel-hr', hrRole);

    const response = await request(app.getHttpServer())
      .get('/admin/users/assignable-roles')
      .set('Cookie', cookie);
    expect(response.status).toBe(200);

    const codes = (response.body as { data: { code: string }[] }).data.map(
      (role) => role.code,
    );
    expect(codes).toContain(hrRole.code); // свою роль назначить можно
    expect(codes).not.toContain(foreignRole.code); // clients.read у актёра нет
    expect(codes).not.toContain('admin'); // ранг 80 выше своего
    expect(codes).not.toContain('developer'); // системная
  });

  // Бессрочный доступ — отдельное право users.grant_permanent_access, явно не выданное ни одной
  // роли (миграция AddPermanentAccessPermission): учётка без даты окончания не отвалится сама
  // никогда, и заводит такие только владелец системы. Проверка в сервисе, а не в @Perm() —
  // она зависит от тела запроса, поэтому e2e тут не дублирует юнит-тесты, а проверяет проводку:
  // код в реестре, право в БД, ручка отдаёт 403 именно на отсутствие срока.
  it('users.manage без users.grant_permanent_access: учётку без срока завести нельзя, со сроком — можно', async () => {
    const role = await createRole('panel-role-no-permanent', [
      PERMISSIONS.USERS_MANAGE,
    ]);
    const { cookie } = await loginAs('panel-no-permanent', role);

    const permanent = await request(app.getHttpServer())
      .post('/admin/users')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({
        username: `permanent-${Date.now()}`,
        password: 'NewPass123!',
        roleId: role.id,
      });
    expect(permanent.status).toBe(403);

    const username = `with-expiry-${Date.now()}`;
    const withExpiry = await request(app.getHttpServer())
      .post('/admin/users')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({
        username,
        password: 'NewPass123!',
        roleId: role.id,
        accessExpiresAt: '2030-01-01T00:00:00.000Z',
      });
    expect(withExpiry.status).toBe(201);

    // И снять срок у уже заведённого тоже нельзя — это та же выдача бессрочного доступа.
    const created = await users.findOneByOrFail({ username });
    const cleared = await request(app.getHttpServer())
      .patch(`/admin/users/${created.id}/access-expiry`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ accessExpiresAt: null });
    expect(cleared.status).toBe(403);
  });

  // Роль в списке пользователей — не только код: панели нужны название (коды ролей из панели
  // произвольны), ранг и is_system цели, иначе нечем решить, предлагать ли действия над строкой.
  it('список пользователей отдаёт роль полем: id, название, ранг, is_system', async () => {
    const role = await createRole('panel-role-lister', [
      PERMISSIONS.USERS_MANAGE,
    ]);
    const { cookie } = await loginAs('panel-lister', role);

    const response = await request(app.getHttpServer())
      .get('/admin/users')
      .set('Cookie', cookie);
    expect(response.status).toBe(200);

    const items = (
      response.body as { data: { items: Record<string, unknown>[] } }
    ).data.items;
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]).toEqual(
      expect.objectContaining({
        role: expect.any(String) as string,
        roleId: expect.any(Number) as number,
        roleTitle: expect.any(String) as string,
        roleRank: expect.any(Number) as number,
        roleIsSystem: expect.any(Boolean) as boolean,
      }),
    );
  });
});

import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { StartedTestContainer } from 'testcontainers';
import { Repository } from 'typeorm';
import { Role } from '../src/core/enums/role.enum';
import { PERMISSIONS } from '../src/core/permissions/permission.registry';
import { Permission } from '../src/modules/roles/domain/permission.entity';
import { Role as RoleEntity } from '../src/modules/roles/domain/role.entity';
import { User } from '../src/modules/users/domain/user.entity';
import { resolveRoleId } from './support/resolve-role-id';
import { runTestMigrations, startTestDatabase } from './support/test-database';

const ORIGIN = 'http://localhost:3001';

// Отдельный файл (не внутри auth.e2e-spec.ts) сознательно: свой собственный /auth/login
// (@Throttle 10/мин, IP-based) — 4 логина здесь плюс уже сделанные в auth.e2e-spec.ts делят один
// файл и один инстанс приложения, суммарно легко перевалить лимит и получить 401 (нет куки от
// throttled логина) вместо проверяемого 403 — ложный провал теста, не баг ролей. Отдельный файл =
// отдельный testcontainers-Postgres + отдельный инстанс Nest = чистый счётчик троттлера.
describe('Матрица ролей: каждая роль против каждой группы защищённых роутов (e2e)', () => {
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

  // §9 ТЗ: «каждая роль против каждой группы роутов» — не один пример, а полная матрица
  // 4 роли × 4 группы. По одному представительному GET-роуту на группу — для 4 легаси-ролей этого
  // достаточно: сиды миграции AddRolesAndPermissions дают им одинаковый набор прав на весь домен
  // (READ+WRITE+DELETE вместе), так что GET здесь не отличить по исходу от POST/PATCH/DELETE.
  // Проверка того, что @Perm() на КОНКРЕТНОМ хендлере (а не просто где-то в контроллере) несёт
  // правильный код по глаголу — отдельный тест ниже, на кастомной роли с одним-единственным
  // *_READ-правом (/code-review high, сессия 28 — гэп покрытия найден на самой этой миграции).
  it('каждая из 4 ролей — 200 только на разрешённых группах роутов, иначе 403', async () => {
    const ROUTE_GROUPS: { path: string; allowed: Role[] }[] = [
      { path: '/admin/users', allowed: [Role.DEVELOPER, Role.ADMIN] },
      {
        path: '/admin/tags',
        allowed: [Role.DEVELOPER, Role.ADMIN, Role.CONTENT_MANAGER],
      },
      {
        path: '/admin/clients',
        allowed: [Role.DEVELOPER, Role.ADMIN, Role.CLIENT_MANAGER],
      },
      { path: '/audit-logs', allowed: [Role.DEVELOPER, Role.ADMIN] },
      {
        path: '/dashboard/stats',
        allowed: [
          Role.DEVELOPER,
          Role.ADMIN,
          Role.CONTENT_MANAGER,
          Role.CLIENT_MANAGER,
        ],
      },
    ];
    const ALL_TEST_ROLES = [
      Role.DEVELOPER,
      Role.ADMIN,
      Role.CONTENT_MANAGER,
      Role.CLIENT_MANAGER,
    ];

    const cookiesByRole = new Map<Role, string>();
    for (const role of ALL_TEST_ROLES) {
      const username = `matrix-${role}`;
      const passwordHash = await bcrypt.hash('MatrixPass123!', 4);
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
        .send({ username, password: 'MatrixPass123!' });
      expect(login.status).toBe(201); // сорвавшийся логин даёт пустую куку и ложный 401 ниже
      cookiesByRole.set(role, cookieHeader(login));
    }

    for (const { path, allowed } of ROUTE_GROUPS) {
      for (const role of ALL_TEST_ROLES) {
        const response = await request(app.getHttpServer())
          .get(path)
          .set('Cookie', cookiesByRole.get(role)!);
        const expectedStatus = allowed.includes(role) ? 200 : 403;
        expect({ path, role, status: response.status }).toEqual({
          path,
          role,
          status: expectedStatus,
        });
      }
    }
  });

  // Ловит именно тот класс регрессии, который матрица выше пропускает: перепутанный код @Perm()
  // на конкретном хендлере (например, TAGS_READ по ошибке оставлен на DELETE вместо TAGS_DELETE).
  // Роль с единственным *_READ-правом не может пройти проверку легаси-массивов RolesGuard вообще
  // (не входит ни в один @Roles(...) — это тестируется отдельно уже существующими rbac-*-файлами),
  // поэтому маршруты здесь выбраны такие, что мутирующие хендлеры гарантированно защищены новым
  // @Perm(), а не старым @Roles() (/code-review high, сессия 28).
  it('роль с единственным *_READ-правом проходит GET, но получает 403 на POST/PATCH/DELETE того же домена', async () => {
    const readOnlyPermission = await permissions.findOneByOrFail({
      code: PERMISSIONS.TAGS_READ,
    });
    const readOnlyRole = await roles.save(
      roles.create({
        code: `role-matrix-read-only-${Date.now()}`,
        title: 'Тестовая роль только на чтение тегов',
        description: null,
        rank: 10,
        isSystem: false,
        permissions: [readOnlyPermission],
      }),
    );

    const username = 'matrix-tags-read-only';
    const passwordHash = await bcrypt.hash('MatrixPass123!', 4);
    await users.save(
      users.create({
        username,
        password: passwordHash,
        roleId: readOnlyRole.id,
        isActive: true,
      }),
    );

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', ORIGIN)
      .send({ username, password: 'MatrixPass123!' });
    expect(login.status).toBe(201);
    const cookie = cookieHeader(login);

    const getResponse = await request(app.getHttpServer())
      .get('/admin/tags')
      .set('Cookie', cookie);
    expect(getResponse.status).toBe(200);

    const postResponse = await request(app.getHttpServer())
      .post('/admin/tags')
      .set('Cookie', cookie)
      .send({ name: 'irrelevant' });
    expect(postResponse.status).toBe(403);

    const patchResponse = await request(app.getHttpServer())
      .patch('/admin/tags/1')
      .set('Cookie', cookie)
      .send({ name: 'irrelevant' });
    expect(patchResponse.status).toBe(403);

    const deleteResponse = await request(app.getHttpServer())
      .delete('/admin/tags/1')
      .set('Cookie', cookie);
    expect(deleteResponse.status).toBe(403);
  });
});

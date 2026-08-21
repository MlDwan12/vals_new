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

// Отдельный файл (не внутри auth.e2e-spec.ts) сознательно: свой собственный /auth/login
// (@Throttle 10/мин, IP-based) — 4 логина здесь плюс уже сделанные в auth.e2e-spec.ts делят один
// файл и один инстанс приложения, суммарно легко перевалить лимит и получить 401 (нет куки от
// throttled логина) вместо проверяемого 403 — ложный провал теста, не баг ролей. Отдельный файл =
// отдельный testcontainers-Postgres + отдельный инстанс Nest = чистый счётчик троттлера.
describe('Матрица ролей: каждая роль против каждой группы защищённых роутов (e2e)', () => {
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

  // §9 ТЗ: «каждая роль против каждой группы роутов» — не один пример, а полная матрица
  // 4 роли × 4 группы. По одному представительному GET-роуту на группу (остальные роуты в той же
  // группе используют тот же @Roles(...) на уровне контроллера — RolesGuard проверяет метаданные
  // класса, не конкретный роут, повторная проверка каждого роута в группе не добавляет покрытия).
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
});

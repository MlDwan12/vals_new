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

// Отдельный файл: все 5 /admin/{articles,cases,services,news,landings}/reindex гейтятся
// PERMISSIONS.SEARCH_REINDEX — отдельным правом от `*.write` того же раздела, выданным только
// admin, не content_manager (M4, round-1 review; переведено с @Roles(...ADMIN_ROLES) на @Perm() —
// code review, сессия 29, находка №1). role-matrix.e2e-spec.ts этого не ловит принципиально, там
// представительный GET-роут на группу, а тут конкретный POST-хендлер несёт код строже, чем
// остальной контроллер. Свой /auth/login — свой testcontainers, чтобы не делить throttle-бюджет с
// другими e2e.
describe('Reindex-роуты: SEARCH_REINDEX уже admin, не content_manager (e2e)', () => {
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

  const cookiesByRole = new Map<Role, string>();

  beforeAll(async () => {
    for (const role of ALL_TEST_ROLES) {
      const username = `reindex-roles-${role}`;
      const passwordHash = await bcrypt.hash('ReindexPass123!', 4);
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
        .send({ username, password: 'ReindexPass123!' });
      expect(login.status).toBe(201);
      cookiesByRole.set(role, cookieHeader(login));
    }
  }, 30_000);

  // Meilisearch в тестовом окружении недоступен (MEILI_HOST указывает на несуществующий хост) —
  // это ожидаемо и не должно ронять запрос: upsertDocuments/reconcileStaleDocuments в
  // SearchIndexService глотают сетевые ошибки через try/catch + warn (ТЗ §7 п.2, уже проверено в
  // прошлых сессиях). Разрешённая роль поэтому получает 200 (@HttpCode(HttpStatus.OK) на методе),
  // не 403 и не 500 — именно это и разделяет «доступ запрещён» от «доступ разрешён, but деградация».
  it('CONTENT_MANAGER получает 403 на всех пяти reindex-роутах, ADMIN/DEVELOPER — 200', async () => {
    const REINDEX_ROUTES = [
      '/admin/articles/reindex',
      '/admin/cases/reindex',
      '/admin/services/reindex',
      '/admin/news/reindex',
      '/admin/landings/reindex',
    ];

    // Все 20 запросов (5 роутов × 4 роли) читают разными куками, ничего друг у друга не мутируют —
    // независимы, гоняем параллельно вместо последовательного двойного цикла (/simplify, сессия 29).
    const cases = REINDEX_ROUTES.flatMap((path) =>
      ALL_TEST_ROLES.map((role) => ({ path, role })),
    );
    const responses = await Promise.all(
      cases.map(({ path, role }) =>
        request(app.getHttpServer())
          .post(path)
          .set('Origin', ORIGIN)
          .set('Cookie', cookiesByRole.get(role)!),
      ),
    );

    cases.forEach(({ path, role }, index) => {
      const expectedStatus = [Role.DEVELOPER, Role.ADMIN].includes(role)
        ? 200
        : 403;
      expect({ path, role, status: responses[index].status }).toEqual({
        path,
        role,
        status: expectedStatus,
      });
    });
  });
});

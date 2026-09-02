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

interface AuditLogEntry {
  id: number;
  userId: number | null;
  username: string | null;
  role: string | null;
  action: string;
  method: string;
  path: string;
  resource: string | null;
  resourceId: number | null;
  statusCode: number;
  errorMessage: string | null;
  ip: string | null;
  meta: Record<string, unknown> | null;
  signed: boolean;
  createdAt: string;
}

interface PaginatedAuditLogs {
  items: AuditLogEntry[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// Отдельный файл (не внутри role-matrix.e2e-spec.ts, не внутри auth.e2e-spec.ts) — свой
// /auth/login (@Throttle 10/мин, IP-based); общий файл с другими e2e делит throttle-бюджет и даёт
// ложный 401 вместо проверяемого статуса (тот же приём, см. комментарий в начале
// role-matrix.e2e-spec.ts).
describe('AuditLogsAdminController (e2e)', () => {
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

  function auditLogsBody(response: request.Response): PaginatedAuditLogs {
    return (response.body as { data: PaginatedAuditLogs }).data;
  }

  // AuditInterceptor пишет через `void auditService.log(...)` (fire-and-forget — аудит
  // намеренно не блокирует ответ, см. комментарий в audit.interceptor.ts) — INSERT может ещё не
  // долететь до БД в момент, когда supertest уже получил ответ на предыдущий запрос. Поэтому
  // здесь опрос вместо одиночного GET сразу после мутации.
  async function waitForAuditEntry(
    cookie: string,
    query: Record<string, string>,
    predicate: (item: AuditLogEntry) => boolean,
  ): Promise<AuditLogEntry> {
    const deadline = Date.now() + 5_000;
    let lastBody: PaginatedAuditLogs | undefined;
    while (Date.now() < deadline) {
      const response = await request(app.getHttpServer())
        .get('/audit-logs')
        .query(query)
        .set('Cookie', cookie);
      lastBody = auditLogsBody(response);
      const found = lastBody.items.find(predicate);
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(
      `Запись в audit-логе не появилась за 5с. Последний ответ: ${JSON.stringify(lastBody)}`,
    );
  }

  async function loginAs(role: Role, username: string): Promise<string> {
    const passwordHash = await bcrypt.hash('AuditPass123!', 4);
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
      .send({ username, password: 'AuditPass123!' });
    expect(login.status).toBe(201); // сорвавшийся логин даёт пустую куку и ложный 401 ниже
    return cookieHeader(login);
  }

  it('DEVELOPER получает 200 и форму PaginatedResult', async () => {
    const cookie = await loginAs(Role.DEVELOPER, 'audit-dev');

    const response = await request(app.getHttpServer())
      .get('/audit-logs')
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    const body = auditLogsBody(response);
    // Не expect.any() внутри objectContaining — оно типизировано как `any` и триггерит
    // no-unsafe-assignment на уже нормально типизированном `body` (PaginatedAuditLogs).
    expect(Array.isArray(body.items)).toBe(true);
    expect(typeof body.page).toBe('number');
    expect(typeof body.limit).toBe('number');
    expect(typeof body.total).toBe('number');
    expect(typeof body.totalPages).toBe('number');
  });

  // Роль вне ADMIN_ROLES → 403 уже покрыто полной матрицей в role-matrix.e2e-spec.ts — тут не
  // дублируем, фокус этого файла на поведении самого audit-модуля.

  it('логин пишет реальную запись LOGIN, видимую через фильтр по action и username', async () => {
    const username = 'audit-login-check';
    const devCookie = await loginAs(Role.DEVELOPER, username);

    const entry = await waitForAuditEntry(
      devCookie,
      { action: 'LOGIN', username },
      (item) => item.username === username,
    );
    expect(entry).toEqual(
      expect.objectContaining({
        username,
        action: 'LOGIN',
        method: 'POST',
        path: '/auth/login',
        resource: 'auth',
        resourceId: null,
        statusCode: 201,
      }),
    );
  });

  it('мутация под /admin/* пишет CREATE с ресурсом без префикса admin', async () => {
    const cookie = await loginAs(Role.DEVELOPER, 'audit-create-check');

    const createTag = await request(app.getHttpServer())
      .post('/admin/tags')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ name: 'audit-e2e-tag' });
    expect(createTag.status).toBe(201);

    const entry = await waitForAuditEntry(
      cookie,
      { action: 'CREATE', resource: 'tags' },
      (item) => item.path === '/admin/tags',
    );
    expect(entry).toEqual(
      expect.objectContaining({
        action: 'CREATE',
        method: 'POST',
        path: '/admin/tags',
        resource: 'tags',
        statusCode: 201,
      }),
    );
  });

  it('username-фильтр не даёт лишнего — не совпадающий username ничего не находит', async () => {
    const cookie = await loginAs(Role.DEVELOPER, 'audit-filter-owner');

    const response = await request(app.getHttpServer())
      .get('/audit-logs')
      .query({ username: 'no-such-user-xyz' })
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    const body = auditLogsBody(response);
    expect(body.items).toHaveLength(0);
    expect(body.total).toBe(0);
  });

  it('пагинация: limit=1 отдаёт ровно одну запись, total отражает реальное количество', async () => {
    const cookie = await loginAs(Role.DEVELOPER, 'audit-page-owner');
    // Логины выше в этом describe уже насытили audit_logs множеством записей (общий testcontainers
    // на файл) — достаточно, чтобы total > 1 без создания дополнительных мутаций специально под
    // этот тест.
    const response = await request(app.getHttpServer())
      .get('/audit-logs')
      .query({ page: 1, limit: 1 })
      .set('Cookie', cookie);

    expect(response.status).toBe(200);
    const body = auditLogsBody(response);
    expect(body.items).toHaveLength(1);
    expect(body.limit).toBe(1);
    expect(body.total).toBeGreaterThan(1);
  });

  // Общий DEVELOPER-логин для тестов ниже (EXPANSION_TASKS.md, задача 2) — /auth/login троттлится
  // 10/мин на IP (см. комментарий в начале файла), новый логин на каждый тест исчерпал бы бюджет
  // вместе с уже существующими выше.
  let sharedDevCookie: string | undefined;
  async function devCookie(): Promise<string> {
    sharedDevCookie ??= await loginAs(Role.DEVELOPER, 'audit-shared-dev');
    return sharedDevCookie;
  }

  it('правка сущности пишет в meta изменённые поля (EXPANSION_TASKS.md §2.2)', async () => {
    const cookie = await devCookie();

    const createTag = await request(app.getHttpServer())
      .post('/admin/tags')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ name: 'audit-meta-tag' });
    expect(createTag.status).toBe(201);
    const tagId = (createTag.body as { data: { id: number } }).data.id;

    const patchTag = await request(app.getHttpServer())
      .patch(`/admin/tags/${tagId}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ name: 'audit-meta-tag-renamed' });
    expect(patchTag.status).toBe(200);

    const entry = await waitForAuditEntry(
      cookie,
      { action: 'UPDATE', resource: 'tags' },
      (item) => item.path === `/admin/tags/${tagId}`,
    );
    // tags не размечен @Audit — запись пишется автоправилом, signed=false (EXPANSION_TASKS.md §2.3).
    expect(entry.signed).toBe(false);
    expect(entry.meta).toEqual({ name: 'audit-meta-tag-renamed' });
  });

  it('сброс пароля отличается в журнале от обычной правки и не светит пароль в meta (§1.6/§2.2/§2.3)', async () => {
    const cookie = await devCookie();
    const targetHash = await bcrypt.hash('TargetPass123!', 4);
    const roleId = await resolveRoleId(moduleRef, Role.CONTENT_MANAGER);
    const target = await users.save(
      users.create({
        username: 'audit-pw-target',
        password: targetHash,
        roleId,
        isActive: true,
      }),
    );

    const resetResponse = await request(app.getHttpServer())
      .patch(`/admin/users/${target.id}/password`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ password: 'NewTargetPass123!' });
    expect(resetResponse.status).toBe(204);

    const entry = await waitForAuditEntry(
      cookie,
      { action: 'password_reset' },
      (item) => item.path === `/admin/users/${target.id}/password`,
    );
    // @Audit({action:'password_reset'}) — не общий 'UPDATE' автоправила, signed=true. resource
    // не переопределён декоратором (совпадает с автовыведенным из пути 'users'). Пароль в meta
    // замаскирован тем же санитайзером, что и неподписанные записи.
    expect(entry.resource).toBe('users');
    expect(entry.action).toBe('password_reset');
    expect(entry.signed).toBe(true);
    expect(entry.meta).toEqual({ password: '***' });
  });

  it('отказ по правам (403) есть в журнале и не задвоен интерсептором+фильтром (§2.4)', async () => {
    const viewerCookie = await devCookie();
    const actorCookie = await loginAs(Role.CLIENT_MANAGER, 'audit-403-actor');

    const forbidden = await request(app.getHttpServer())
      .post('/admin/tags')
      .set('Origin', ORIGIN)
      .set('Cookie', actorCookie)
      .send({ name: 'should-not-be-created' });
    expect(forbidden.status).toBe(403);

    await waitForAuditEntry(
      viewerCookie,
      { username: 'audit-403-actor' },
      (item) => item.path === '/admin/tags' && item.statusCode === 403,
    );

    const response = await request(app.getHttpServer())
      .get('/audit-logs')
      .query({ username: 'audit-403-actor' })
      .set('Cookie', viewerCookie);
    const matches = auditLogsBody(response).items.filter(
      (item) => item.path === '/admin/tags' && item.statusCode === 403,
    );
    expect(matches).toHaveLength(1);
  });

  it('400 от валидации DTO не пишется в журнал (§2.4)', async () => {
    const cookie = await devCookie();

    const invalid = await request(app.getHttpServer())
      .post('/admin/tags')
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ name: '' });
    expect(invalid.status).toBe(400);

    // Даём шанс "выстрелил и забыл" записи долететь, если бы она была — затем убеждаемся в
    // отсутствии. Без опроса here — отсутствие нельзя дождаться, только выждать разумный интервал.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const response = await request(app.getHttpServer())
      .get('/audit-logs')
      .query({ username: 'audit-shared-dev', resource: 'tags' })
      .set('Cookie', cookie);
    const has400 = auditLogsBody(response).items.some(
      (item) => item.statusCode === 400,
    );
    expect(has400).toBe(false);
  });

  it('400 от бизнес-правила (одиночное сообщение, не ValidationPipe) пишется в журнал (code review high)', async () => {
    const cookie = await devCookie();
    const target = await users.save(
      users.create({
        username: 'audit-400-business-target',
        password: await bcrypt.hash('TargetPass123!', 4),
        roleId: await resolveRoleId(moduleRef, Role.CONTENT_MANAGER),
        isActive: true,
      }),
    );

    // roleId проходит class-validator (@IsInt @Min(1)), несуществующий id отклоняется сервисом
    // одиночным BadRequestException — та самая "форма отказа", которую §2.4 требует не терять,
    // в отличие от опечатки в форме (проверено тестом выше).
    const businessRejection = await request(app.getHttpServer())
      .patch(`/admin/users/${target.id}/role`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie)
      .send({ roleId: 999_999 });
    expect(businessRejection.status).toBe(400);

    await waitForAuditEntry(
      cookie,
      { action: 'ERROR' },
      (item) =>
        item.path === `/admin/users/${target.id}/role` &&
        item.statusCode === 400,
    );
  });

  // security-audit-2026-08-31.md, MEDIUM №8: POST /bitrix (@Public()) писал сырые
  // name/phone/email/message в audit_logs.meta мимо доменной маскировки клиентского модуля —
  // запись остаётся (видимость "что за мутация была"), но без ПД.
  it('POST /bitrix (@Public()) пишет запись без ПД в meta (§2.4/security-audit №8)', async () => {
    const cookie = await devCookie();

    const submitLead = await request(app.getHttpServer())
      .post('/bitrix')
      .set('Origin', ORIGIN)
      .send({
        name: 'Аудит ПД',
        phone: '79990009999',
        type: 'FREE_CONSULTATION',
      });
    expect(submitLead.status).toBe(201);

    const entry = await waitForAuditEntry(
      cookie,
      { resource: 'bitrix' },
      (item) => item.path === '/bitrix' && item.statusCode === 201,
    );
    expect(entry.meta).toBeNull();
    expect(entry.userId).toBeNull();
  });
});

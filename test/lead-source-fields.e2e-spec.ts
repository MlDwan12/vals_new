import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { StartedTestContainer } from 'testcontainers';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../src/core/enums/role.enum';
import { BitrixClient } from '../src/modules/clients/application/bitrix-client';
import { User } from '../src/modules/users/domain/user.entity';
import { resolveRoleId } from './support/resolve-role-id';
import { runTestMigrations, startTestDatabase } from './support/test-database';

const ORIGIN = 'http://localhost:3001';

// Отдельный файл со своим testcontainers/app instance — /bitrix ограничен @Throttle(5/60с, IP-based),
// а leads.e2e-spec.ts уже расходует 4 из 5 запросов своим сценариям (retry/honeypot/невалидный тип);
// делить с ним бюджет здесь нельзя (тот же принцип, что уже применён к /auth/login в
// role-matrix.e2e-spec.ts/users-admin-roles.e2e-spec.ts/reindex-roles.e2e-spec.ts).
interface LeadResponseBody {
  id: number;
  phoneRaw: string;
  formId: string | null;
  pagePath: string | null;
  referrer: string | null;
  landingPath: string | null;
  userAgent: string | null;
  payload: { source: { blockId: string } | null };
}

function cookieHeader(response: request.Response): string {
  const raw = response.headers['set-cookie'] as unknown as string[] | undefined;
  return (raw ?? []).map((cookie) => cookie.split(';')[0]).join('; ');
}

function leadListItems(response: request.Response): LeadResponseBody[] {
  return (response.body as { data: { items: LeadResponseBody[] } }).data.items;
}

class MockBitrixClient {
  sendLead(): Promise<{
    bitrixLeadId: string;
    response: Record<string, unknown>;
  }> {
    return Promise.resolve({ bitrixLeadId: '1', response: { result: 1 } });
  }
}

describe('Lead source fields — EXPANSION_TASKS.md §6/§7 (e2e)', () => {
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
    })
      .overrideProvider(BitrixClient)
      .useValue(new MockBitrixClient())
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();

    users = moduleRef.get<Repository<User>>(getRepositoryToken(User));
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await postgres.stop();
  });

  async function loginAsClientManager(): Promise<string> {
    const username = `lead-source-admin-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const passwordHash = await bcrypt.hash('LeadSourceAdminPass123!', 4);
    const roleId = await resolveRoleId(moduleRef, Role.CLIENT_MANAGER);
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
      .send({ username, password: 'LeadSourceAdminPass123!' });
    return cookieHeader(login);
  }

  it('известные formId/pagePath/blockId/referrer/landingPath сохраняются, User-Agent берётся из заголовка запроса', async () => {
    const submit = await request(app.getHttpServer())
      .post('/bitrix')
      .set('Origin', ORIGIN)
      .set('User-Agent', 'Mozilla/5.0 (e2e test agent)')
      .send({
        name: 'Мария',
        phone: '79990005555',
        type: 'FREE_CONSULTATION',
        formId: 'free-consultation',
        pagePath: '/services/orm',
        blockId: 'hero-cta',
        referrer: 'https://google.com/search?q=orm',
        landingPath: '/services/orm',
      });
    expect(submit.status).toBe(201);

    const cookies = await loginAsClientManager();
    const list = await request(app.getHttpServer())
      .get('/admin/client-leads?limit=50')
      .set('Cookie', cookies);
    const lead = leadListItems(list).find(
      (item) => item.phoneRaw === '79990005555',
    );

    expect(lead).toMatchObject({
      formId: 'free-consultation',
      pagePath: '/services/orm',
      referrer: 'https://google.com/search?q=orm',
      landingPath: '/services/orm',
      userAgent: 'Mozilla/5.0 (e2e test agent)',
    });
    expect(lead?.payload.source).toEqual({ blockId: 'hero-cta' });

    // Фильтр по formId — тот же лид, без отдельного сабмита (throttle-бюджет этого файла тоже
    // ограничен, см. комментарий у describe).
    const filtered = await request(app.getHttpServer())
      .get('/admin/client-leads?formId=free-consultation&limit=50')
      .set('Cookie', cookies);
    expect(filtered.status).toBe(200);
    const filteredItems = leadListItems(filtered);
    expect(filteredItems.length).toBeGreaterThan(0);
    expect(
      filteredItems.every((item) => item.formId === 'free-consultation'),
    ).toBe(true);
  });

  it('незнакомый formId не отклоняет заявку — метка теряется, а не 400 (expansion-decisions.md §6.1)', async () => {
    const submit = await request(app.getHttpServer())
      .post('/bitrix')
      .set('Origin', ORIGIN)
      .send({
        name: 'Незнакомая форма',
        phone: '79990006666',
        type: 'PARTNER',
        formId: 'promo-2026-block',
      });
    expect(submit.status).toBe(201);

    const cookies = await loginAsClientManager();
    const list = await request(app.getHttpServer())
      .get('/admin/client-leads?limit=50')
      .set('Cookie', cookies);
    const lead = leadListItems(list).find(
      (item) => item.phoneRaw === '79990006666',
    );

    expect(lead?.formId).toBeNull();
  });
});

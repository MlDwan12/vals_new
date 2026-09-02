import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { StartedTestContainer } from 'testcontainers';
import { Repository } from 'typeorm';
import { Role } from '../src/core/enums/role.enum';
import { BitrixClient } from '../src/modules/clients/application/bitrix-client';
import { User } from '../src/modules/users/domain/user.entity';
import { resolveRoleId } from './support/resolve-role-id';
import { runTestMigrations, startTestDatabase } from './support/test-database';

const ORIGIN = 'http://localhost:3001';

interface LeadResponseBody {
  id: number;
  name: string;
  phoneRaw: string;
  status: string;
  retryCount: number;
  nextRetryAt: string | null;
  bitrixLeadId: string | null;
  bitrixError: string | null;
}

function cookieHeader(response: request.Response): string {
  const raw = response.headers['set-cookie'] as unknown as string[] | undefined;
  return (raw ?? []).map((cookie) => cookie.split(';')[0]).join('; ');
}

function leadData(response: request.Response): LeadResponseBody {
  return (response.body as { data: LeadResponseBody }).data;
}

function leadListItems(response: request.Response): LeadResponseBody[] {
  return (response.body as { data: { items: LeadResponseBody[] } }).data.items;
}

// Подменяет реальный HTTP-вызов Bitrix — управляемое поведение (успех/отказ) без сети.
class MockBitrixClient {
  behavior: 'fail' | 'succeed' = 'fail';
  calls = 0;

  sendLead(): Promise<{
    bitrixLeadId: string;
    response: Record<string, unknown>;
  }> {
    this.calls += 1;
    if (this.behavior === 'fail') {
      return Promise.reject(new Error('Bitrix unavailable (mock)'));
    }
    return Promise.resolve({
      bitrixLeadId: '9999',
      response: { result: 9999 },
    });
  }
}

describe('Leads (e2e)', () => {
  let app: INestApplication;
  let postgres: StartedTestContainer;
  let users: Repository<User>;
  let moduleRef: TestingModule;
  let mockBitrixClient: MockBitrixClient;

  beforeAll(async () => {
    postgres = await startTestDatabase();
    await runTestMigrations();

    // Отложенная загрузка только для AppModule — см. комментарий в auth.e2e-spec.ts.
    const { AppModule } =
      require('../src/app.module') as typeof import('../src/app.module');

    mockBitrixClient = new MockBitrixClient();

    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(BitrixClient)
      .useValue(mockBitrixClient)
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
    const username = `leads-admin-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const passwordHash = await bcrypt.hash('LeadsAdminPass123!', 4);
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
      .send({ username, password: 'LeadsAdminPass123!' });
    return cookieHeader(login);
  }

  it('заявка сохраняется и отвечает 201 клиенту, даже если Bitrix недоступен', async () => {
    mockBitrixClient.behavior = 'fail';

    const response = await request(app.getHttpServer())
      .post('/bitrix')
      .set('Origin', ORIGIN)
      .send({
        name: 'Иван Иванов',
        phone: '79990001111',
        type: 'PARTNER',
      });

    // Приём заявки не обращается к Bitrix вообще (доставка асинхронная) — Bitrix мог бы даже не
    // существовать, ответ клиенту не зависит от него.
    expect(response.status).toBe(201);
    expect(mockBitrixClient.calls).toBe(0);

    const cookies = await loginAsClientManager();
    const list = await request(app.getHttpServer())
      .get('/admin/client-leads')
      .set('Cookie', cookies);

    expect(list.status).toBe(200);
    expect(leadListItems(list)[0]).toMatchObject({
      name: 'Иван Иванов',
      status: 'pending',
      retryCount: 0,
      bitrixLeadId: null,
    });
  });

  it('ручной retry: неудачная попытка обновляет статус/ошибку, следующая успешная — sent', async () => {
    mockBitrixClient.behavior = 'fail';

    const submit = await request(app.getHttpServer())
      .post('/bitrix')
      .set('Origin', ORIGIN)
      .send({
        name: 'Пётр Петров',
        phone: '79990002222',
        type: 'ADD_QUESTION',
      });
    expect(submit.status).toBe(201);

    const cookies = await loginAsClientManager();
    const list = await request(app.getHttpServer())
      .get('/admin/client-leads?limit=1')
      .set('Cookie', cookies);
    const leadId = leadListItems(list)[0].id;

    const failedRetry = await request(app.getHttpServer())
      .post(`/admin/client-leads/${leadId}/retry`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookies);

    expect(failedRetry.status).toBe(201);
    expect(leadData(failedRetry)).toMatchObject({
      status: 'pending',
      retryCount: 1,
      bitrixLeadId: null,
    });
    expect(leadData(failedRetry).bitrixError).toContain('Bitrix unavailable');
    expect(leadData(failedRetry).nextRetryAt).not.toBeNull();

    mockBitrixClient.behavior = 'succeed';

    const successfulRetry = await request(app.getHttpServer())
      .post(`/admin/client-leads/${leadId}/retry`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookies);

    expect(successfulRetry.status).toBe(201);
    expect(leadData(successfulRetry)).toMatchObject({
      status: 'sent',
      bitrixLeadId: '9999',
      bitrixError: null,
      nextRetryAt: null,
    });
  });

  it('honeypot: заполненное поле website отвечает 201, но заявка не сохраняется', async () => {
    const before = await request(app.getHttpServer())
      .post('/bitrix')
      .set('Origin', ORIGIN)
      .send({
        name: 'Бот',
        phone: '79990003333',
        type: 'PARTNER',
        website: 'http://spam.example',
      });

    expect(before.status).toBe(201);

    const cookies = await loginAsClientManager();
    const list = await request(app.getHttpServer())
      .get('/admin/client-leads?limit=50')
      .set('Cookie', cookies);

    const spamLead = leadListItems(list).find(
      (item) => item.phoneRaw === '79990003333',
    );
    expect(spamLead).toBeUndefined();
  });

  it('невалидный тип заявки отклоняется 400', async () => {
    const response = await request(app.getHttpServer())
      .post('/bitrix')
      .set('Origin', ORIGIN)
      .send({ name: 'X', phone: '79990004444', type: 'BOGUS' });

    expect(response.status).toBe(400);
  });

  // security-audit-2026-08-31.md, MEDIUM №6: phone без единой цифры нормализуется в null —
  // без этой проверки заявка проходила бы 201, отключая дедупликацию клиентов для неё полностью.
  it('phone без цифр (normalizePhone -> null) отклоняется 400', async () => {
    const response = await request(app.getHttpServer())
      .post('/bitrix')
      .set('Origin', ORIGIN)
      .send({ name: 'X', phone: 'x', type: 'FREE_CONSULTATION' });

    expect(response.status).toBe(400);
  });
});

import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { StartedTestContainer } from 'testcontainers';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Role } from '../src/core/enums/role.enum';
import { PERMISSIONS } from '../src/core/permissions/permission.registry';
import { AuditLog } from '../src/modules/audit/domain/audit-log.entity';
import { BitrixClient } from '../src/modules/clients/application/bitrix-client';
import { ClientLead } from '../src/modules/clients/domain/client-lead.entity';
import { ClientLeadType } from '../src/modules/clients/enums/client-lead-type.enum';
import { ClientLeadsRepository } from '../src/modules/clients/infrastructure/client-leads.repository';
import { Permission } from '../src/modules/roles/domain/permission.entity';
import { Role as RoleEntity } from '../src/modules/roles/domain/role.entity';
import { User } from '../src/modules/users/domain/user.entity';
import { resolveRoleId } from './support/resolve-role-id';
import { runTestMigrations, startTestDatabase } from './support/test-database';

const ORIGIN = 'http://localhost:3001';
const PASSWORD = 'LeadContactsPass123!';
const PHONE = '+7 (900) 555-44-33';
const EMAIL = 'Maria.Ivanova@Example.com';
const MASKED_PHONE = '+7 900 ***-**-33';

class MockBitrixClient {
  sendLead(): Promise<{
    bitrixLeadId: string;
    response: Record<string, unknown>;
  }> {
    return Promise.resolve({ bitrixLeadId: '1', response: { result: 1 } });
  }
}

function cookieHeader(response: request.Response): string {
  const raw = response.headers['set-cookie'] as unknown as string[] | undefined;
  return (raw ?? []).map((cookie) => cookie.split(';')[0]).join('; ');
}

function data<T>(response: request.Response): T {
  return (response.body as { data: T }).data;
}

// Маски контактов в ответах админки и раскрытие полных контактов с записью в журнал (задача 6,
// этап 2). Свой файл и свой инстанс приложения: логинов здесь четыре, у /auth/login лимит 10 в
// минуту на IP.
describe('Admin client-leads contacts: маски и просмотр с журналом (e2e)', () => {
  let app: INestApplication;
  let postgres: StartedTestContainer;
  let moduleRef: TestingModule;
  let lead: ClientLead;
  let clientManagerCookies: string;

  async function login(roleId: number, prefix: string): Promise<string> {
    const users = moduleRef.get<Repository<User>>(getRepositoryToken(User));
    const username = `${prefix}-${Date.now()}`;
    await users.save(
      users.create({
        username,
        password: await bcrypt.hash(PASSWORD, 4),
        roleId,
        isActive: true,
      }),
    );

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', ORIGIN)
      .send({ username, password: PASSWORD });
    return cookieHeader(response);
  }

  function revealContacts(id: number, cookies?: string): request.Test {
    const req = request(app.getHttpServer())
      .post(`/admin/client-leads/${id}/contacts`)
      .set('Origin', ORIGIN);
    return cookies ? req.set('Cookie', cookies) : req;
  }

  // Журнал пишется после ответа (void в AuditInterceptor/HttpExceptionFilter) — ждём строку, а не
  // читаем один раз сразу после запроса.
  async function waitForAuditLog(
    where: FindOptionsWhere<AuditLog>,
  ): Promise<AuditLog | null> {
    const logs = moduleRef.get<Repository<AuditLog>>(
      getRepositoryToken(AuditLog),
    );
    for (let attempt = 0; attempt < 20; attempt++) {
      const found = await logs.findOneBy(where);
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return null;
  }

  beforeAll(async () => {
    postgres = await startTestDatabase();
    await runTestMigrations();

    const { AppModule } =
      require('../src/app.module') as typeof import('../src/app.module');

    moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BitrixClient)
      .useValue(new MockBitrixClient())
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();

    lead = await moduleRef.get(ClientLeadsRepository).submitLead({
      type: ClientLeadType.FREE_CONSULTATION,
      name: 'Мария Иванова',
      phoneRaw: PHONE,
      emailRaw: EMAIL,
      message: null,
      comment: null,
      utm: null,
      payload: {},
      bitrixPayload: {},
      formId: null,
      pagePath: null,
      referrer: null,
      landingPath: null,
      userAgent: null,
    });

    clientManagerCookies = await login(
      await resolveRoleId(moduleRef, Role.CLIENT_MANAGER),
      'contacts-client-manager',
    );
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await postgres.stop();
  });

  it('список и карточка заявки отдают телефон и почту масками', async () => {
    const list = await request(app.getHttpServer())
      .get('/admin/client-leads')
      .set('Cookie', clientManagerCookies);
    const card = await request(app.getHttpServer())
      .get(`/admin/client-leads/${lead.id}`)
      .set('Cookie', clientManagerCookies);

    const expected = { phoneRaw: MASKED_PHONE, emailRaw: 'M***@Example.com' };
    expect(
      data<{ items: { id: number }[] }>(list).items.find(
        (item) => item.id === lead.id,
      ),
    ).toMatchObject(expected);
    expect(data(card)).toMatchObject(expected);
  });

  it('клиенты и их контакты тоже отдаются масками', async () => {
    const clients = await request(app.getHttpServer())
      .get('/admin/clients')
      .set('Cookie', clientManagerCookies);
    const contacts = await request(app.getHttpServer())
      .get(`/admin/client-contacts/client/${lead.clientId}`)
      .set('Cookie', clientManagerCookies);

    expect(
      data<{ items: { id: number }[] }>(clients).items.find(
        (item) => item.id === lead.clientId,
      ),
    ).toMatchObject({
      primaryPhone: MASKED_PHONE,
      primaryEmail: 'm***@example.com',
    });
    expect(
      data<{ value: string }[]>(contacts)
        .map((contact) => contact.value)
        .sort(),
    ).toEqual([MASKED_PHONE, 'm***@example.com'].sort());
  });

  it('с правом — полные контакты как введены в форме, и просмотр записан в журнал', async () => {
    const response = await revealContacts(lead.id, clientManagerCookies);

    expect(response.status).toBe(200);
    expect(data(response)).toEqual({ phone: PHONE, email: EMAIL });

    const log = await waitForAuditLog({
      action: 'contacts_view',
      resource: 'client-leads',
      resourceId: lead.id,
      statusCode: 200,
    });
    expect(log).not.toBeNull();
    expect(log?.username).toMatch(/^contacts-client-manager-/);
    expect(log?.signed).toBe(true);
  });

  it('админ тоже получает право миграцией', async () => {
    const cookies = await login(
      await resolveRoleId(moduleRef, Role.ADMIN),
      'contacts-admin',
    );
    expect((await revealContacts(lead.id, cookies)).status).toBe(200);
  });

  it('доступ к заявкам без права на контакты — 403, и попытка в журнале', async () => {
    const permissions = moduleRef.get<Repository<Permission>>(
      getRepositoryToken(Permission),
    );
    const roles = moduleRef.get<Repository<RoleEntity>>(
      getRepositoryToken(RoleEntity),
    );
    const readOnlyRole = await roles.save(
      roles.create({
        code: `leads-read-only-${Date.now()}`,
        title: 'Только просмотр заявок',
        description: null,
        rank: 10,
        isSystem: false,
        permissions: [
          await permissions.findOneByOrFail({ code: PERMISSIONS.CLIENTS_READ }),
        ],
      }),
    );
    const cookies = await login(readOnlyRole.id, 'contacts-read-only');

    // Сама заявка ему видна — закрыты только контакты.
    const card = await request(app.getHttpServer())
      .get(`/admin/client-leads/${lead.id}`)
      .set('Cookie', cookies);
    expect(card.status).toBe(200);

    const response = await revealContacts(lead.id, cookies);
    expect(response.status).toBe(403);
    expect(JSON.stringify(response.body)).not.toContain('555-44-33');

    const log = await waitForAuditLog({
      path: `/admin/client-leads/${lead.id}/contacts`,
      statusCode: 403,
    });
    expect(log).not.toBeNull();
  });

  it('роль без доступа к заявкам — 403', async () => {
    const cookies = await login(
      await resolveRoleId(moduleRef, Role.CONTENT_MANAGER),
      'contacts-content-manager',
    );
    expect((await revealContacts(lead.id, cookies)).status).toBe(403);
  });

  it('несуществующая заявка — 404', async () => {
    expect((await revealContacts(999999, clientManagerCookies)).status).toBe(
      404,
    );
  });

  it('без входа — 401', async () => {
    expect((await revealContacts(lead.id)).status).toBe(401);
  });
});

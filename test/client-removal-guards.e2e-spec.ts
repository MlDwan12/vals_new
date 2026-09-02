import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { StartedTestContainer } from 'testcontainers';
import { Repository } from 'typeorm';
import { Role } from '../src/core/enums/role.enum';
import { Client } from '../src/modules/clients/domain/client.entity';
import { ClientLead } from '../src/modules/clients/domain/client-lead.entity';
import { ClientLeadType } from '../src/modules/clients/enums/client-lead-type.enum';
import { LeadDeliveryStatus } from '../src/modules/clients/enums/lead-delivery-status.enum';
import { User } from '../src/modules/users/domain/user.entity';
import { resolveRoleId } from './support/resolve-role-id';
import { runTestMigrations, startTestDatabase } from './support/test-database';

const ORIGIN = 'http://localhost:3001';

// security-audit-2026-08-31.md, LOW №16: DELETE /admin/clients/:id раньше каскадно чистил
// merged-дублей (isMerged: true, mergedIntoClientId обнулялся SET NULL — «клиент-призрак») и
// уже отправленные в Bitrix лиды (client_leads.client_id — CASCADE, теряя локальную историю
// доставки при живом лиде в CRM). Оба случая — отдельный файл: свой /auth/login, throttle-бюджет
// не делится с другими e2e (тот же приём, см. комментарий в role-matrix.e2e-spec.ts).
describe('DELETE /admin/clients/:id: guards из security-audit №16 (e2e)', () => {
  let app: INestApplication;
  let postgres: StartedTestContainer;
  let users: Repository<User>;
  let clients: Repository<Client>;
  let clientLeads: Repository<ClientLead>;
  let moduleRef: TestingModule;
  let cookie: string;

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
    clients = moduleRef.get<Repository<Client>>(getRepositoryToken(Client));
    clientLeads = moduleRef.get<Repository<ClientLead>>(
      getRepositoryToken(ClientLead),
    );

    const username = 'client-removal-guards-owner';
    const passwordHash = await bcrypt.hash('ClientRemovalPass123!', 4);
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
      .send({ username, password: 'ClientRemovalPass123!' });
    const raw = login.headers['set-cookie'] as unknown as string[] | undefined;
    cookie = (raw ?? []).map((c) => c.split(';')[0]).join('; ');
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await postgres.stop();
  });

  function createClient(overrides: Partial<Client> = {}): Promise<Client> {
    return clients.save(
      clients.create({
        name: 'Тест',
        primaryPhone: null,
        primaryEmail: null,
        leadsCount: 0,
        lastLeadAt: null,
        isMerged: false,
        mergedIntoClientId: null,
        ...overrides,
      }),
    );
  }

  it('клиент, в которого смёрджены дубли — 409, не удаляется', async () => {
    const primary = await createClient();
    await createClient({ isMerged: true, mergedIntoClientId: primary.id });

    const response = await request(app.getHttpServer())
      .delete(`/admin/clients/${primary.id}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie);

    expect(response.status).toBe(409);
    expect(await clients.findOne({ where: { id: primary.id } })).not.toBeNull();
  });

  it('клиент с уже отправленным в Bitrix лидом — 409, не удаляется', async () => {
    const client = await createClient();
    await clientLeads.save(
      clientLeads.create({
        clientId: client.id,
        externalSystem: 'BITRIX',
        type: ClientLeadType.PARTNER,
        payload: {},
        status: LeadDeliveryStatus.SENT,
        bitrixLeadId: '4242',
      }),
    );

    const response = await request(app.getHttpServer())
      .delete(`/admin/clients/${client.id}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie);

    expect(response.status).toBe(409);
    expect(await clients.findOne({ where: { id: client.id } })).not.toBeNull();
  });

  it('обычный клиент без смёрдженных дублей и без SENT-лидов удаляется', async () => {
    const client = await createClient();
    await clientLeads.save(
      clientLeads.create({
        clientId: client.id,
        externalSystem: 'BITRIX',
        type: ClientLeadType.PARTNER,
        payload: {},
        status: LeadDeliveryStatus.PENDING,
      }),
    );

    const response = await request(app.getHttpServer())
      .delete(`/admin/clients/${client.id}`)
      .set('Origin', ORIGIN)
      .set('Cookie', cookie);

    expect(response.status).toBe(204);
    expect(await clients.findOne({ where: { id: client.id } })).toBeNull();
  });
});

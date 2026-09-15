import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { StartedTestContainer } from 'testcontainers';
import { DataSource, Repository } from 'typeorm';
import { Role } from '../src/core/enums/role.enum';
import { BitrixClient } from '../src/modules/clients/application/bitrix-client';
import { ClientLead } from '../src/modules/clients/domain/client-lead.entity';
import { ClientLeadType } from '../src/modules/clients/enums/client-lead-type.enum';
import { LeadDeliveryStatus } from '../src/modules/clients/enums/lead-delivery-status.enum';
import { ClientLeadsRepository } from '../src/modules/clients/infrastructure/client-leads.repository';
import { User } from '../src/modules/users/domain/user.entity';
import { resolveRoleId } from './support/resolve-role-id';
import { runTestMigrations, startTestDatabase } from './support/test-database';

const ORIGIN = 'http://localhost:3001';
const PASSWORD = 'LeadFiltersAdminPass123!';
// Далеко в будущем: планировщик доставки берёт PENDING только с подошедшим nextRetryAt — без этого
// он поменял бы статусы засеянных заявок посреди теста.
const FAR_FUTURE = new Date('2099-01-01T00:00:00Z');

interface LeadItem {
  id: number;
  name: string | null;
  status: LeadDeliveryStatus;
}

interface LeadSeed {
  name: string;
  phoneRaw: string;
  emailRaw: string | null;
  formId: string | null;
  pagePath: string | null;
  status: LeadDeliveryStatus;
  createdAt: Date;
}

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

function names(response: request.Response): string[] {
  return (response.body as { data: { items: LeadItem[] } }).data.items
    .map((item) => item.name ?? '')
    .sort();
}

// Фильтры списка заявок для раздела «Заявки» в админке. Заявки засеваются через репозиторий, а не
// POST /bitrix: у публичной ручки лимит 5 запросов в минуту на IP, а сценариев здесь больше.
describe('Admin client-leads filters (e2e)', () => {
  let app: INestApplication;
  let postgres: StartedTestContainer;
  let moduleRef: TestingModule;
  let cookies: string;

  const seeds: LeadSeed[] = [
    {
      name: 'Анна Петрова',
      phoneRaw: '+7 (900) 111-22-33',
      emailRaw: 'Anna.Petrova@Example.com',
      formId: 'free-consultation',
      pagePath: '/services/orm',
      status: LeadDeliveryStatus.SENT,
      createdAt: new Date('2026-09-01T10:00:00Z'),
    },
    {
      name: 'Борис',
      phoneRaw: '89004445566',
      emailRaw: null,
      formId: 'exit-intent',
      pagePath: '/services/serm',
      status: LeadDeliveryStatus.FAILED,
      createdAt: new Date('2026-09-05T10:00:00Z'),
    },
    {
      name: 'Вера',
      phoneRaw: '79007778899',
      emailRaw: 'vera@example.com',
      formId: 'free-consultation',
      pagePath: '/services/serm',
      status: LeadDeliveryStatus.PENDING,
      createdAt: new Date('2026-09-10T10:00:00Z'),
    },
    {
      name: 'Глеб',
      phoneRaw: '79001234567',
      emailRaw: null,
      formId: null,
      pagePath: null,
      // Заявку прямо сейчас забрал планировщик — наружу это всё ещё «в очереди».
      status: LeadDeliveryStatus.SENDING,
      createdAt: new Date('2026-09-12T10:00:00Z'),
    },
  ];

  async function seedLeads(): Promise<void> {
    const leadsRepository = moduleRef.get(ClientLeadsRepository);
    const leads = moduleRef.get(DataSource).getRepository(ClientLead);

    for (const seed of seeds) {
      const lead = await leadsRepository.submitLead({
        type: ClientLeadType.FREE_CONSULTATION,
        name: seed.name,
        phoneRaw: seed.phoneRaw,
        emailRaw: seed.emailRaw,
        message: null,
        comment: null,
        utm: null,
        payload: {},
        bitrixPayload: {},
        formId: seed.formId,
        pagePath: seed.pagePath,
        referrer: null,
        landingPath: null,
        userAgent: null,
      });
      await leads.update(lead.id, {
        status: seed.status,
        createdAt: seed.createdAt,
        nextRetryAt: FAR_FUTURE,
        sendingAt:
          seed.status === LeadDeliveryStatus.SENDING ? new Date() : null,
      });
    }
  }

  async function login(): Promise<string> {
    const users = moduleRef.get<Repository<User>>(getRepositoryToken(User));
    const username = `lead-filters-admin-${Date.now()}`;
    await users.save(
      users.create({
        username,
        password: await bcrypt.hash(PASSWORD, 4),
        roleId: await resolveRoleId(moduleRef, Role.CLIENT_MANAGER),
        isActive: true,
      }),
    );

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .set('Origin', ORIGIN)
      .send({ username, password: PASSWORD });
    return cookieHeader(response);
  }

  function list(query: string): request.Test {
    return request(app.getHttpServer())
      .get(`/admin/client-leads?limit=50&${query}`)
      .set('Cookie', cookies);
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

    await seedLeads();
    cookies = await login();
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await postgres.stop();
  });

  it('без фильтров отдаёт все заявки, новые сверху', async () => {
    const response = await list('');
    expect(response.status).toBe(200);
    const items = (response.body as { data: { items: LeadItem[] } }).data.items;
    expect(items.map((item) => item.name)).toEqual([
      'Глеб',
      'Вера',
      'Борис',
      'Анна Петрова',
    ]);
  });

  it('статус «в очереди» включает заявку, которую планировщик забрал в отправку', async () => {
    const response = await list('status=pending');
    expect(names(response)).toEqual(['Вера', 'Глеб']);
    const statuses = (
      response.body as { data: { items: LeadItem[] } }
    ).data.items.map((item) => item.status);
    expect(statuses).toEqual([
      LeadDeliveryStatus.PENDING,
      LeadDeliveryStatus.PENDING,
    ]);
  });

  it('статус «ошибка» и «доставлен» — только свои заявки', async () => {
    expect(names(await list('status=failed'))).toEqual(['Борис']);
    expect(names(await list('status=sent'))).toEqual(['Анна Петрова']);
  });

  it('внутренний статус sending в фильтре не принимается', async () => {
    expect((await list('status=sending')).status).toBe(400);
  });

  it('период включает обе границы', async () => {
    const response = await list(
      'dateFrom=2026-09-05T10:00:00.000Z&dateTo=2026-09-10T10:00:00.000Z',
    );
    expect(names(response)).toEqual(['Борис', 'Вера']);
  });

  it('невалидная дата — 400', async () => {
    expect((await list('dateFrom=вчера')).status).toBe(400);
  });

  it('поиск по имени и почте — подстрокой без учёта регистра', async () => {
    expect(names(await list(`search=${encodeURIComponent('петров')}`))).toEqual(
      ['Анна Петрова'],
    );
    expect(names(await list('search=VERA@EXAMPLE'))).toEqual(['Вера']);
  });

  it('поиск по телефону — в любой записи номера, в том числе с ведущей 8', async () => {
    expect(
      names(await list(`search=${encodeURIComponent('111-22-33')}`)),
    ).toEqual(['Анна Петрова']);
    expect(names(await list('search=79004445566'))).toEqual(['Борис']);
    expect(names(await list('search=89007778899'))).toEqual(['Вера']);
  });

  it('спецсимволы LIKE в поиске не работают как шаблон', async () => {
    expect(names(await list(`search=${encodeURIComponent('%')}`))).toEqual([]);
  });

  it('фильтры складываются', async () => {
    const response = await list(
      'formId=free-consultation&pagePath=%2Fservices%2Fserm',
    );
    expect(names(response)).toEqual(['Вера']);
  });

  it('facets отдаёт встречающиеся формы и страницы без пустых значений', async () => {
    const response = await request(app.getHttpServer())
      .get('/admin/client-leads/facets')
      .set('Cookie', cookies);

    expect(response.status).toBe(200);
    expect((response.body as { data: unknown }).data).toEqual({
      formIds: ['exit-intent', 'free-consultation'],
      pagePaths: ['/services/orm', '/services/serm'],
    });
  });

  it('facets без входа — 401', async () => {
    const response = await request(app.getHttpServer()).get(
      '/admin/client-leads/facets',
    );
    expect(response.status).toBe(401);
  });
});

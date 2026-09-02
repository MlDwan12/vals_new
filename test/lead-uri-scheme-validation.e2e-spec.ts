import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { StartedTestContainer } from 'testcontainers';
import { runTestMigrations, startTestDatabase } from './support/test-database';

const ORIGIN = 'http://localhost:3001';

// Отдельный файл: POST /bitrix ограничен @Throttle(5/60с) — 3 запроса здесь плюс уже сделанные в
// leads.e2e-spec.ts (5 штук) в одном файле дали бы 429 вместо проверяемого 400 (тот же приём, см.
// комментарий в начале role-matrix.e2e-spec.ts). Свой testcontainers-Postgres + свой инстанс Nest.
describe('POST /bitrix: pagePath/referrer/landingPath с опасной схемой (e2e)', () => {
  let app: INestApplication;
  let postgres: StartedTestContainer;
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
  }, 60_000);

  afterAll(async () => {
    await app.close();
    await postgres.stop();
  });

  // security-audit-2026-08-31.md, LOW №15: pagePath/referrer/landingPath раньше только
  // обрезались по длине, без проверки схемы — javascript:/data: проходили как есть.
  it.each(['pagePath', 'referrer', 'landingPath'])(
    '%s с опасной схемой (javascript:) отклоняется 400',
    async (field) => {
      const response = await request(app.getHttpServer())
        .post('/bitrix')
        .set('Origin', ORIGIN)
        .send({
          name: 'X',
          phone: '79990005555',
          type: 'FREE_CONSULTATION',
          [field]: 'javascript:alert(1)',
        });

      expect(response.status).toBe(400);
    },
  );
});

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { AppModule } from '../src/app.module';

describe('Health (e2e)', () => {
  let app: INestApplication;
  let postgres: StartedTestContainer;

  beforeAll(async () => {
    postgres = await new GenericContainer('postgres:16')
      .withEnvironment({
        POSTGRES_USER: 'test',
        POSTGRES_PASSWORD: 'test',
        POSTGRES_DB: 'test',
      })
      .withExposedPorts(5432)
      .withWaitStrategy(
        Wait.forLogMessage(/database system is ready to accept connections/, 2),
      )
      .start();

    process.env.DB_HOST = postgres.getHost();
    process.env.DB_PORT = String(postgres.getMappedPort(5432));
    process.env.DB_USER = 'test';
    process.env.DB_PASS = 'test';
    process.env.DB_NAME = 'test';
    process.env.CORS_ORIGINS = 'http://localhost:3001';

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    await postgres.stop();
  });

  it('GET /health отвечает конвертом успеха и живой БД', async () => {
    const response = await request(app.getHttpServer()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      status: 200,
      data: { status: 'ok', info: { database: { status: 'up' } } },
    });
  });

  it('несуществующий роут отвечает конвертом ошибки', async () => {
    const response = await request(app.getHttpServer()).get('/unknown-route');

    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({
      success: false,
      code: 'NOT_FOUND',
      status: 404,
    });

    const body = response.body as { requestId: unknown };
    expect(typeof body.requestId).toBe('string');
  });
});

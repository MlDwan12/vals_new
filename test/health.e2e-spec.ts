import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { StartedTestContainer } from 'testcontainers';
import { startTestDatabase } from './support/test-database';

describe('Health (e2e)', () => {
  let app: INestApplication;
  let postgres: StartedTestContainer;

  beforeAll(async () => {
    postgres = await startTestDatabase();

    // AppModule подгружается через require() и только теперь: ConfigModule.forRoot() внутри него
    // читает process.env синхронно в момент вычисления модуля (несмотря на то что forRoot —
    // async-функция, тело до первого await выполняется сразу). Статический import в начале файла
    // вычислился бы раньше, чем startTestDatabase успеет подменить DB_HOST/DB_PORT — приложение
    // тихо подключилось бы к обычной dev-БД вместо контейнера. Динамический import() здесь не
    // подходит — под ts-jest + module:nodenext он не транспилируется в require() и падает без
    // --experimental-vm-modules.
    const { AppModule } =
      require('../src/app.module') as typeof import('../src/app.module');

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

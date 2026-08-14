import { GenericContainer, StartedTestContainer, Wait } from 'testcontainers';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from '../../src/data-source.js';

export async function startTestDatabase(): Promise<StartedTestContainer> {
  const container = await new GenericContainer('postgres:16')
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

  process.env.DB_HOST = container.getHost();
  process.env.DB_PORT = String(container.getMappedPort(5432));
  process.env.DB_USER = 'test';
  process.env.DB_PASS = 'test';
  process.env.DB_NAME = 'test';
  process.env.CORS_ORIGINS = 'http://localhost:3001';
  process.env.JWT_SECRET = 'e2e-test-access-secret-min-32-characters';
  process.env.JWT_REFRESH_SECRET = 'e2e-test-refresh-secret-min-32-characters';
  // Не настоящий webhook — только чтобы пройти обязательную zod-валидацию env на старте приложения.
  // Тесты, которым реально нужно управлять доставкой в Bitrix, подменяют BitrixClient через
  // overrideProvider, а не ходят по этому URL.
  process.env.BITRIX_WEBHOOK = 'http://bitrix-webhook.invalid';

  return container;
}

// Отдельный DataSource только для прогона миграций против тестового контейнера — переиспользует
// конфиг из src/data-source.ts (тот же источник истины, что и CLI), не трогает подключение,
// которое поднимет само приложение через TypeOrmModule.
export async function runTestMigrations(): Promise<void> {
  const migrationsDataSource = new DataSource(buildDataSourceOptions());
  await migrationsDataSource.initialize();
  await migrationsDataSource.runMigrations();
  await migrationsDataSource.destroy();
}

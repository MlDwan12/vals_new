import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';
import { DataSource, DataSourceOptions } from 'typeorm';
import { validate } from './config/env.validation';

loadEnv({ quiet: true });

// Функция, а не константа: значения читаются из process.env в момент вызова, не в момент импорта
// модуля — это позволяет тестам (test/support/test-database.ts) переопределить DB_* переменные
// (адрес эфемерного testcontainers-контейнера) до фактического построения опций подключения.
export function buildDataSourceOptions(): DataSourceOptions {
  const env = validate(process.env);

  return {
    type: 'postgres',
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USER,
    password: env.DB_PASS,
    database: env.DB_NAME,
    entities: [join(__dirname, 'modules/**/*.entity{.ts,.js}')],
    migrations: [join(__dirname, 'database/migrations/*{.ts,.js}')],
    synchronize: false,
    // CLI-инструменты (migration:*/seed) — не рантайм приложения. SQL полезен при отладке миграций,
    // но не должен литься в stdout безусловно (LOW code review: SQL с ПД, например INSERT сида
    // с username/паролем-хешем).
    logging: env.NODE_ENV !== 'production',
  };
}

export const dataSourceOptions: DataSourceOptions = buildDataSourceOptions();

export default new DataSource(dataSourceOptions);

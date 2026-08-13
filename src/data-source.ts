import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { join } from 'node:path';
import { DataSource, DataSourceOptions } from 'typeorm';
import { validate } from './config/env.validation';

loadEnv();

const env = validate(process.env);

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: env.DB_HOST,
  port: env.DB_PORT,
  username: env.DB_USER,
  password: env.DB_PASS,
  database: env.DB_NAME,
  entities: [join(__dirname, 'modules/**/*.entity{.ts,.js}')],
  migrations: [join(__dirname, 'database/migrations/*{.ts,.js}')],
  synchronize: false,
  logging: true,
};

export default new DataSource(dataSourceOptions);

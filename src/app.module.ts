import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ServeStaticModule } from '@nestjs/serve-static';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { LoggerModule } from 'nestjs-pino';
import { EnvConfig, validate } from './config/env.validation';
import { CoreModule } from './core/core.module';
import { UPLOADS_ROOT } from './core/uploads.constants';
import { ArticlesModule } from './modules/articles/articles.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { CasesModule } from './modules/cases/cases.module';
import { ClientsModule } from './modules/clients/clients.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { HealthModule } from './modules/health/health.module';
import { IndustriesModule } from './modules/industries/industries.module';
import { MediaModule } from './modules/media/media.module';
import { SearchModule } from './modules/search/search.module';
import { ServicesModule } from './modules/services/services.module';
import { TagsModule } from './modules/tags/tags.module';
import { TariffPeriodsModule } from './modules/tariff-periods/tariff-periods.module';
import { TariffsModule } from './modules/tariffs/tariffs.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    ServeStaticModule.forRoot({
      rootPath: UPLOADS_ROOT,
      serveRoot: '/uploads',
      serveStaticOptions: {
        // Файлы именуются случайным UUID и никогда не перезаписываются (переливка — новый UUID) —
        // безопасно кешировать агрессивно. index/dotfiles — не нужны для чисто файлового каталога
        // (LOW code review).
        maxAge: '1y',
        immutable: true,
        index: false,
        dotfiles: 'ignore',
      },
    }),
    ScheduleModule.forRoot(),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<EnvConfig, true>) => ({
        pinoHttp: {
          level: configService.get('LOG_LEVEL', { infer: true }),
          // Клиентский x-request-id принимается без проверки формата/длины — попадает в каждую
          // лог-строку и в тело ответа (requestId); без ограничения клиент может залить логи
          // произвольно длинной/управляющими символами строкой (LOW code review). Разрешён только
          // разумный "трейсинговый" алфавит и длина.
          genReqId: (req: IncomingMessage) => {
            const existing = req.headers['x-request-id'];
            if (
              typeof existing === 'string' &&
              /^[A-Za-z0-9._-]{1,128}$/.test(existing)
            ) {
              return existing;
            }
            return randomUUID();
          },
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'res.headers["set-cookie"]',
              // TypeORM QueryFailedError.parameters — реальные значения биндов SQL-запроса (ПД
              // лида при сбое записи); AxiosError.config — вебхук Bitrix с секретным токеном в
              // url и ПД лида в data (R4/C1, round-2 review — механизм, а не только дисциплина
              // вызывающего кода не логировать error целиком). err.raw.* — обязательно тоже:
              // pino-std-serializers копирует ВЕСЬ исходный объект ошибки целиком под err.raw в
              // конце errSerializer (node_modules/pino-std-serializers/lib/err.js), в обход
              // редактирования плоских полей выше — без этих путей защита обходится тем же самым
              // полем вторым каналом (найдено /code-review high на этом же батче).
              'err.parameters',
              'err.config',
              'err.raw.parameters',
              'err.raw.config',
            ],
            remove: true,
          },
          // Успешные запросы не логируются построчно (ТЗ §4) — только 4xx/5xx.
          customLogLevel: (
            _req: IncomingMessage,
            res: ServerResponse,
            err?: Error,
          ) => {
            if (err || res.statusCode >= 500) return 'error';
            if (res.statusCode >= 400) return 'warn';
            return 'silent';
          },
          transport: configService.get('LOG_PRETTY', { infer: true })
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
        },
      }),
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<EnvConfig, true>) => {
        const host = configService.get('DB_HOST', { infer: true });
        const port = configService.get('DB_PORT', { infer: true });
        const username = configService.get('DB_USER', { infer: true });
        const password = configService.get('DB_PASS', { infer: true });
        const database = configService.get('DB_NAME', { infer: true });

        return {
          type: 'postgres',
          host,
          port,
          username,
          password,
          database,
          autoLoadEntities: true,
          synchronize: false,
        };
      },
    }),
    CoreModule,
    HealthModule,
    SearchModule,
    ArticlesModule,
    CasesModule,
    ServicesModule,
    TariffsModule,
    TariffPeriodsModule,
    TagsModule,
    IndustriesModule,
    EmployeesModule,
    MediaModule,
    ClientsModule,
    UsersModule,
    AuditModule,
    AuthModule,
    DashboardModule,
  ],
})
export class AppModule {}

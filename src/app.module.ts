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
import { safeErrSerializer } from './core/logging/safe-err-serializer';
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
import { RolesModule } from './modules/roles/roles.module';
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
              // X-Internal-Key — секретный ключ SSR-обхода глобального rate limit (R8, round-2
              // review): pino-http по умолчанию логирует весь req.headers, без этого пути ключ
              // уходит в логи в открытом виде на каждом 4xx/5xx от internal-трафика (найдено
              // /code-review high на этом же батче).
              'req.headers["x-internal-key"]',
              'res.headers["set-cookie"]',
            ],
            remove: true,
          },
          // Allowlist вместо denylist для err (N-4, round-3 review): денилист по одному полю
          // (parameters → detail/driverError → config) неполон по построению — набор полей
          // ошибки задаёт pg/TypeORM/axios, не мы. safeErrSerializer явно перечисляет, что
          // безопасно (type/message/stack + code/constraint/table/column/schema/severity),
          // всё остальное (err.detail — значения нарушенного constraint, ПД лида; err.config —
          // вебхук Bitrix с секретным токеном) в лог не попадает по умолчанию.
          serializers: {
            err: safeErrSerializer,
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
    RolesModule,
    UsersModule,
    AuditModule,
    AuthModule,
    DashboardModule,
  ],
})
export class AppModule {}

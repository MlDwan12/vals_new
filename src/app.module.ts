import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
import { EmployeesModule } from './modules/employees/employees.module';
import { HealthModule } from './modules/health/health.module';
import { IndustriesModule } from './modules/industries/industries.module';
import { MediaModule } from './modules/media/media.module';
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
    }),
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<EnvConfig, true>) => ({
        pinoHttp: {
          level: configService.get('LOG_LEVEL', { infer: true }),
          genReqId: (req: IncomingMessage) => {
            const existing = req.headers['x-request-id'];
            return typeof existing === 'string' ? existing : randomUUID();
          },
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'res.headers["set-cookie"]',
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
  ],
})
export class AppModule {}

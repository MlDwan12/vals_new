import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { LoggerModule } from 'nestjs-pino';
import { EnvConfig, validate } from './config/env.validation';
import { CoreModule } from './core/core.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
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
  ],
})
export class AppModule {}

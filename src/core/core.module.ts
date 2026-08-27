import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { EnvConfig } from '../config/env.validation';
import { AuditModule } from '../modules/audit/audit.module';
import { UsersModule } from '../modules/users/users.module';
import { resolveGlobalThrottleLimit } from './rate-limit/internal-api-throttle.util';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { AuthGuard } from './guards/auth.guard';
import { CsrfOriginGuard } from './guards/csrf-origin.guard';
import { RolesGuard } from './guards/roles.guard';
import { AuditInterceptor } from './interceptors/audit.interceptor';
import { ResponseInterceptor } from './interceptors/response.interceptor';

const GLOBAL_THROTTLE_LIMIT = 100;

@Module({
  imports: [
    // limit — функция от ExecutionContext (штатная точка расширения @nestjs/throttler 6), не
    // статическое число: SSR публичного сайта ходит в API напрямую по docker-сети, минуя nginx, и
    // весь его трафик иначе попадает в общий с реальными посетителями IP-бакет (R8, round-2
    // review). /bitrix и /auth/login не затронуты — у них свой @Throttle() на уровне роута,
    // который в приоритете библиотеки выше этого дефолта.
    ThrottlerModule.forRootAsync({
      useFactory: (configService: ConfigService<EnvConfig, true>) => ({
        throttlers: [
          {
            ttl: 60_000,
            limit: resolveGlobalThrottleLimit(
              configService,
              GLOBAL_THROTTLE_LIMIT,
            ),
          },
        ],
      }),
      inject: [ConfigService],
    }),
    // Секрет передаётся явно на каждый verify/sign (см. AuthGuard, modules/auth) — тут без дефолта.
    JwtModule.register({}),
    AuditModule,
    // AuthGuard вызывает AuthContextService (не репозиторий напрямую, EXPANSION_TASKS.md §1.2) —
    // UsersModule не зависит от CoreModule, цикла нет.
    UsersModule,
  ],
  providers: [
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    },
    { provide: APP_GUARD, useClass: CsrfOriginGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    // ВАЖНО: должен идти после ResponseInterceptor. Interceptor-провайдеры оборачивают друг друга
    // в порядке регистрации — при таком порядке AuditInterceptor.tap() видит "сырой" возврат
    // контроллера (например { username, role } на /auth/login), а не уже обёрнутый ResponseInterceptor
    // конверт { success, status, data }. Поменять местами — и username/role в LOGIN-записях
    // аудита молча превратятся в null (AuditInterceptor.ts читает data.username/data.role).
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class CoreModule {}

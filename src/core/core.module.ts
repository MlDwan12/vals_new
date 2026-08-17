import { Module, ValidationPipe } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuditModule } from '../modules/audit/audit.module';
import { HttpExceptionFilter } from './filters/http-exception.filter';
import { AuthGuard } from './guards/auth.guard';
import { CsrfOriginGuard } from './guards/csrf-origin.guard';
import { RolesGuard } from './guards/roles.guard';
import { AuditInterceptor } from './interceptors/audit.interceptor';
import { ResponseInterceptor } from './interceptors/response.interceptor';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 100 }],
    }),
    // Секрет передаётся явно на каждый verify/sign (см. AuthGuard, modules/auth) — тут без дефолта.
    JwtModule.register({}),
    AuditModule,
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

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from '../../modules/audit/application/audit.service';
import { AuditAction } from '../../modules/audit/enums/audit-action.enum';
import {
  MUTATION_METHODS,
  resolveAuditResource,
  resolveClientIp,
} from '../audit/resolve-audit-context.util';
import { AuthenticatedRequestUser } from '../guards/auth.guard';

// Успешные мутации + logout (ТЗ §2 — "аудит-лог всех мутаций"). 401/403/5xx — отдельная ветка в
// HttpExceptionFilter (успешный next.handle() сюда никогда не долетает с этими статусами).
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method.toUpperCase();
    const path = request.path;
    const isLogout = path === '/auth/logout';

    if (!MUTATION_METHODS.has(method) && !isLogout) {
      return next.handle();
    }

    const response = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      tap((data) => {
        const user = (request as Request & { user?: AuthenticatedRequestUser })
          .user;
        const { resource, resourceId } = resolveAuditResource(path);
        // На /auth/login request.user ещё не выставлен (маршрут @Public(), JWT ещё не выпущен) —
        // имя/роль берём из тела ответа контроллера, как в старом коде.
        const loginResponse =
          path === '/auth/login'
            ? (data as { username?: unknown; role?: unknown } | undefined)
            : undefined;

        void this.auditService.log({
          userId: user?.sub ?? null,
          username:
            user?.username ??
            (typeof loginResponse?.username === 'string'
              ? loginResponse.username
              : null),
          role:
            user?.role ??
            (typeof loginResponse?.role === 'string'
              ? loginResponse.role
              : null),
          action: this.resolveAction(method, path),
          method,
          path,
          resource,
          resourceId,
          statusCode: response.statusCode,
          errorMessage: null,
          ip: resolveClientIp(request),
        });
      }),
    );
  }

  private resolveAction(method: string, path: string): AuditAction {
    if (path === '/auth/login') return AuditAction.LOGIN;
    if (path === '/auth/logout') return AuditAction.LOGOUT;
    if (method === 'DELETE') return AuditAction.DELETE;
    if (method === 'PATCH' || method === 'PUT') return AuditAction.UPDATE;
    return AuditAction.CREATE;
  }
}

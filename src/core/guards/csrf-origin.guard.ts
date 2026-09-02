import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { EnvConfig } from '../../config/env.validation';

const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Глобальная CSRF-защита через проверку Origin (ТЗ §6) — не навешивается выборочно на роуты,
// иначе забытый роут окажется дырой. Origin сверяется с тем же списком, что и CORS.
// Действует и на @Public()-роуты (сейчас POST /bitrix, POST/PATCH /auth/login|refresh) —
// осознанно: единственный публичный отправитель формы заявок — браузер публичного сайта.
// Зафиксировано явно (security-audit-2026-08-31.md №9): POST /bitrix не предназначен для
// server-to-server интеграций без собственного Origin — такой вызов получит 403 без объяснения
// на фронте. Если это когда-либо понадобится, нужен отдельный путь аутентификации/allowlist для
// такого клиента, не молчаливое исключение по @Public().
@Injectable()
export class CsrfOriginGuard implements CanActivate {
  private readonly allowedOrigins: Set<string>;

  constructor(configService: ConfigService<EnvConfig, true>) {
    this.allowedOrigins = new Set(
      configService
        .get('CORS_ORIGINS', { infer: true })
        .split(',')
        .map((origin) => origin.trim()),
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (!MUTATION_METHODS.has(request.method.toUpperCase())) {
      return true;
    }

    const origin = request.headers.origin;

    if (typeof origin !== 'string' || !this.allowedOrigins.has(origin)) {
      throw new ForbiddenException(
        'Источник запроса не разрешён для изменяющих операций',
      );
    }

    return true;
  }
}

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

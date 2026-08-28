import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { AuditService } from '../../modules/audit/application/audit.service';
import { AuditAction } from '../../modules/audit/enums/audit-action.enum';
import { BoundedTtlMap } from '../collections/bounded-ttl-map';
import {
  MUTATION_METHODS,
  resolveAuditResource,
  resolveClientIp,
} from '../audit/resolve-audit-context.util';
import { AuthenticatedRequestUser } from '../guards/auth.guard';
import { ErrorCode } from '../exceptions/error-code.enum';

// Окно подавления повторных анонимных ACCESS_DENIED с одного IP (ТЗ §7 п.5 — без этого 401/403 от
// бота, перебирающего роуты, раздувают таблицу одной строкой на запрос). Только здесь, а не в
// AuditService.log(): это политика конкретно ACCESS_DENIED-ветки этого фильтра (единственного
// источника ACCESS_DENIED), а не общего механизма записи, которым пользуются и другие вызывающие.
const ANONYMOUS_ACCESS_DENIED_WINDOW_MS = 60_000;
// Ключ — IP из запроса, не подтверждённая учётка — при MAX_TRACKED записях сметаем протухшие
// (LOW code review: без этого много уникальных IP/бот со сменой IP растит Map неограниченно).
const MAX_TRACKED_IPS = 5000;

interface ApiErrorResponse {
  success: false;
  code: ErrorCode;
  message: string;
  status: number;
  timestamp: string;
  requestId: string;
  details: unknown;
}

// HttpStatus — enum, но статус пришедший из exception.getStatus()/дефолта — обычный number;
// сравнение через типизированную-как-number константу, чтобы не сравнивать number с enum напрямую.
const INTERNAL_SERVER_ERROR_STATUS: number = HttpStatus.INTERNAL_SERVER_ERROR;
const UNAUTHORIZED_STATUS: number = HttpStatus.UNAUTHORIZED;
const FORBIDDEN_STATUS: number = HttpStatus.FORBIDDEN;
const BAD_REQUEST_STATUS: number = HttpStatus.BAD_REQUEST;

const STATUS_TO_CODE: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.VALIDATION_ERROR,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  // Nest сам транслирует превышение лимита размера файла (Multer LIMIT_FILE_SIZE) в
  // PayloadTooLargeException — см. media-admin.controller.ts (загрузка) и transformException()
  // в @nestjs/platform-express.
  [HttpStatus.PAYLOAD_TOO_LARGE]: ErrorCode.PAYLOAD_TOO_LARGE,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMITED,
  // Terminus (health-чек БД) и SearchIndexService.search() бросают ServiceUnavailableException.
  [HttpStatus.SERVICE_UNAVAILABLE]: ErrorCode.SERVICE_UNAVAILABLE,
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly lastAnonymousAccessDeniedAt = new BoundedTtlMap<number>(
    MAX_TRACKED_IPS,
    (lastAt) => Date.now() - lastAt >= ANONYMOUS_ACCESS_DENIED_WINDOW_MS,
  );

  constructor(
    private readonly logger: PinoLogger,
    private readonly auditService: AuditService,
  ) {
    this.logger.setContext(HttpExceptionFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = this.resolveRequestId(request.id);

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const code = STATUS_TO_CODE[status] ?? ErrorCode.INTERNAL_ERROR;
    const { message, details } = this.resolveBody(exception, status);

    if (status >= INTERNAL_SERVER_ERROR_STATUS) {
      this.logger.error({ err: exception, requestId }, 'Unhandled exception');
    } else {
      this.logger.warn({ requestId, status, code }, message);
    }

    // Отличаем "форма не прошла ValidationPipe" (details — массив сообщений class-validator,
    // ошибка ничего не значит без разбора по полям) от 400, брошенного вручную бизнес-правилом
    // (details === null, единственное осмысленное сообщение) — например, самозащита последнего
    // системного пользователя (users.service.ts) тоже отвечает 400, но это ровно то отказное
    // событие, ради которого журнал заводился (EXPANSION_TASKS.md §2.4: "самое интересное в
    // журнале — именно отказы"), а не опечатка в форме. Только первое — не событие для журнала.
    const isValidationPipeNoise =
      status === BAD_REQUEST_STATUS && Array.isArray(details);
    this.writeAuditLog(request, status, message, isValidationPipeNoise);

    const body: ApiErrorResponse = {
      success: false,
      code,
      message,
      status,
      timestamp: new Date().toISOString(),
      requestId,
      details,
    };

    response.status(status).json(body);
  }

  private resolveRequestId(id: string | number | object): string {
    if (typeof id === 'string') return id;
    if (typeof id === 'number') return String(id);
    return JSON.stringify(id);
  }

  // Наружу никогда не уходит message неопознанной ошибки и голого 500 (ТЗ §4) — стек/детали
  // только в лог. Остальные HttpException (включая 503 от health-чека) — это осознанно
  // выброшенные структурированные ответы, их безопасно показывать как есть, иначе /health
  // теряет смысл (не видно, какой именно сервис лежит).
  private resolveBody(
    exception: unknown,
    status: number,
  ): { message: string; details: unknown } {
    if (
      !(exception instanceof HttpException) ||
      status === INTERNAL_SERVER_ERROR_STATUS
    ) {
      return { message: 'Внутренняя ошибка сервера', details: null };
    }

    const body = exception.getResponse();
    if (typeof body === 'string') {
      return { message: body, details: null };
    }

    const { message, error } = body as { message?: unknown; error?: unknown };

    if (
      Array.isArray(message) &&
      message.every((item) => typeof item === 'string')
    ) {
      return { message: 'Ошибка валидации', details: message };
    }

    if (typeof message === 'string') {
      return { message, details: null };
    }

    if (typeof error === 'string') {
      return { message: error, details: null };
    }

    // Тело не в стандартной форме class-validator/Nest (например, отчёт Terminus) —
    // сообщение общее, диагностика — в details.
    return { message: 'Ошибка запроса', details: body };
  }

  // Аудит здесь, а не только в AuditInterceptor — интерцептор видит лишь успешные ответы,
  // security-события (401/403) и 5xx долетают только сюда (ТЗ §2 "аудит-лог ... событий
  // безопасности"). Пишем не каждую ошибку, а мутации/auth-пути/401/403/5xx — иначе 404 от
  // случайного сканера роутов раздувает таблицу так же, как если бы это была не ошибка вовсе.
  private writeAuditLog(
    request: Request,
    status: number,
    errorMessage: string,
    isValidationPipeNoise: boolean,
  ): void {
    const method = request.method.toUpperCase();
    const path = request.path;
    const isMutation = MUTATION_METHODS.has(method);
    const isAuthPath = path.startsWith('/auth/');
    const isSecurityEvent =
      status === UNAUTHORIZED_STATUS || status === FORBIDDEN_STATUS;
    const isServerError = status >= INTERNAL_SERVER_ERROR_STATUS;

    if (
      isValidationPipeNoise ||
      (!isMutation && !isAuthPath && !isSecurityEvent && !isServerError)
    ) {
      return;
    }

    const user = (request as Request & { user?: AuthenticatedRequestUser })
      .user;
    const ip = resolveClientIp(request);

    if (
      isSecurityEvent &&
      user === undefined &&
      ip &&
      this.isAnonymousAccessDeniedSuppressed(ip)
    ) {
      return;
    }
    // При неудачном логине request.user ещё не выставлен (AuthGuard/стратегия падает раньше) —
    // подхватываем логин из тела запроса, чтобы в аудите было видно, под каким именем пытались войти.
    const attemptedUsername =
      path === '/auth/login'
        ? (request.body as { username?: unknown } | undefined)?.username
        : undefined;
    const username =
      user?.username ??
      (typeof attemptedUsername === 'string' ? attemptedUsername : null);

    const { resource, resourceId } = resolveAuditResource(path);

    void this.auditService.log({
      userId: user?.sub ?? null,
      username,
      role: user?.role ?? null,
      action: isSecurityEvent ? AuditAction.ACCESS_DENIED : AuditAction.ERROR,
      method,
      path,
      resource,
      resourceId,
      statusCode: status,
      errorMessage,
      ip,
      meta: null,
      // Этот путь никогда не смотрит на @Audit — только AuditInterceptor (успешные мутации) это
      // делает (EXPANSION_TASKS.md §2.3), поэтому здесь всегда автоправило.
      signed: false,
    });
  }

  private isAnonymousAccessDeniedSuppressed(ip: string): boolean {
    const now = Date.now();
    const last = this.lastAnonymousAccessDeniedAt.get(ip);
    this.lastAnonymousAccessDeniedAt.set(ip, now);
    return last !== undefined && now - last < ANONYMOUS_ACCESS_DENIED_WINDOW_MS;
  }
}

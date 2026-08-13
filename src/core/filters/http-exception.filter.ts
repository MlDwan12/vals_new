import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { ErrorCode } from '../exceptions/error-code.enum';

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

const STATUS_TO_CODE: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.VALIDATION_ERROR,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.RATE_LIMITED,
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: PinoLogger) {
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
}

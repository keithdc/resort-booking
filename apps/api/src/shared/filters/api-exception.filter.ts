/**
 * @file apps/api/src/shared/filters/api-exception.filter.ts
 * @shared Maps HTTP errors to { status, message, code }
 * @dependencies @nestjs/common
 */

import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import type { ApiErrorBody } from '@resort-booking/shared-types';
import { RateLimitedException } from '../http/rate-limited.exception';
import type { RequestWithId } from '../http/request-id';

/** The standard error body plus, for server errors, the id support can search the logs for. */
interface ServerErrorBody extends ApiErrorBody {
  requestId?: string;
}

interface ExceptionBody {
  message?: string | string[];
  code?: string;
  problems?: unknown;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  /**
   * Known errors keep their status and message. Anything unexpected is logged ONCE here, with its stack and
   * the request id (server side only), and the client gets a generic body carrying just that id.
   */
  public catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<RequestWithId>();
    const requestId = request.requestId;

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const parsed = parseExceptionBody(raw);
      const body: ServerErrorBody = {
        status: 'error',
        message: parsed.message,
      };
      if (parsed.code !== undefined) {
        body.code = parsed.code;
      }
      if (parsed.problems !== undefined) {
        body.problems = parsed.problems;
      }
      if (status >= 500 && requestId !== undefined) {
        body.requestId = requestId;
      }
      if (exception instanceof RateLimitedException) {
        response.setHeader('Retry-After', String(Math.max(1, Math.ceil(exception.retryAfterSeconds))));
      }
      response.status(status).json(body);
      return;
    }

    // Path only: a query string can carry an email or a promo code.
    const path = (request.originalUrl ?? request.url ?? '').split('?')[0] ?? '';
    this.logger.error(
      `Unhandled error [${requestId ?? 'no-request-id'}] ${request.method} ${path}: ${exception instanceof Error ? exception.message : 'non-Error thrown'}`,
      exception instanceof Error ? exception.stack : undefined,
    );
    const body: ServerErrorBody = {
      status: 'error',
      message: 'Internal server error',
      code: 'INTERNAL',
    };
    if (requestId !== undefined) {
      body.requestId = requestId;
    }
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(body);
  }
}

function parseExceptionBody(raw: string | object): { message: string; code?: string; problems?: string[] } {
  if (typeof raw === 'string') {
    return { message: raw };
  }
  const candidate = raw as ExceptionBody;
  const messageValue = candidate.message;
  const message = Array.isArray(messageValue)
    ? messageValue.join(', ')
    : (messageValue ?? 'Request failed');
  const result: { message: string; code?: string; problems?: string[] } = { message };
  if (candidate.code !== undefined) {
    result.code = candidate.code;
  }
  if (Array.isArray(candidate.problems) && candidate.problems.every((item): boolean => typeof item === 'string')) {
    result.problems = candidate.problems as string[];
  }
  return result;
}

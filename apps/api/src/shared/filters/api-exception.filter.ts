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
} from '@nestjs/common';
import type { Response } from 'express';
import type { ApiErrorBody } from '@resort-booking/shared-types';

interface ExceptionBody {
  message?: string | string[];
  code?: string;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  public catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const parsed = parseExceptionBody(raw);
      const body: ApiErrorBody = {
        status: 'error',
        message: parsed.message,
      };
      if (parsed.code !== undefined) {
        body.code = parsed.code;
      }
      response.status(status).json(body);
      return;
    }

    const body: ApiErrorBody = {
      status: 'error',
      message: 'Internal server error',
      code: 'INTERNAL',
    };
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(body);
  }
}

function parseExceptionBody(raw: string | object): { message: string; code?: string } {
  if (typeof raw === 'string') {
    return { message: raw };
  }
  const candidate = raw as ExceptionBody;
  const messageValue = candidate.message;
  const message = Array.isArray(messageValue)
    ? messageValue.join(', ')
    : (messageValue ?? 'Request failed');
  if (candidate.code !== undefined) {
    return { message, code: candidate.code };
  }
  return { message };
}

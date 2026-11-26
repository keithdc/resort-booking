/**
 * @file apps/api/src/shared/filters/api-exception.filter.spec.ts
 * @shared Error mapping, request ids, Retry-After and logging of unexpected errors
 */

import { BadRequestException, HttpException, Logger, NotFoundException } from '@nestjs/common';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { RateLimitedException } from '../http/rate-limited.exception';
import { PasswordTooWeakException } from '../validation/password-too-weak.exception';
import { ApiExceptionFilter } from './api-exception.filter';

interface Captured {
  status: number | null;
  body: unknown;
  headers: Record<string, string>;
}

function run(exception: unknown, request: { requestId?: string; method?: string; originalUrl?: string } = {}): Captured {
  const captured: Captured = { status: null, body: null, headers: {} };
  const response = {
    setHeader: (name: string, value: string): void => {
      captured.headers[name] = value;
    },
    status: (code: number) => {
      captured.status = code;
      return {
        json: (payload: unknown): void => {
          captured.body = payload;
        },
      };
    },
  };
  new ApiExceptionFilter().catch(exception, new ExecutionContextHost([{ method: 'GET', originalUrl: '/x', ...request }, response]));
  return captured;
}

describe('ApiExceptionFilter', () => {
  const error = jest.spyOn(Logger.prototype, 'error');

  beforeEach(() => {
    error.mockReset();
    error.mockImplementation((): void => undefined);
  });

  afterAll(() => error.mockRestore());

  it('keeps the status, message and code of an expected error and does not log it', () => {
    const captured = run(new NotFoundException({ message: 'Hold not found', code: 'HOLD_NOT_FOUND' }));

    expect(captured.status).toBe(404);
    expect(captured.body).toEqual({ status: 'error', message: 'Hold not found', code: 'HOLD_NOT_FOUND' });
    expect(error).not.toHaveBeenCalled();
  });

  it('joins validation messages into one', () => {
    const captured = run(new BadRequestException({ message: ['a is required', 'b must be a number'] }));

    expect(captured.body).toEqual({ status: 'error', message: 'a is required, b must be a number' });
  });

  it('passes the list of problems of a weak password on to the client, and drops anything that is not a list of strings', () => {
    const weak = run(new PasswordTooWeakException(['Use at least 10 characters', 'Add a number']));
    expect(weak.status).toBe(400);
    expect(weak.body).toEqual({
      status: 'error',
      message: 'Password is too weak: Use at least 10 characters; Add a number',
      code: 'PASSWORD_TOO_WEAK',
      problems: ['Use at least 10 characters', 'Add a number'],
    });

    const odd = run(new BadRequestException({ message: 'x', code: 'X', problems: [1, { a: 2 }] }));
    expect(odd.body).toEqual({ status: 'error', message: 'x', code: 'X' });
  });

  it('answers an unexpected error with a generic 500 and the request id, never the real message', () => {
    const captured = run(new Error('relation "secret_table" does not exist'), { requestId: 'req-abc12345' });

    expect(captured.status).toBe(500);
    expect(captured.body).toEqual({ status: 'error', message: 'Internal server error', code: 'INTERNAL', requestId: 'req-abc12345' });
    expect(JSON.stringify(captured.body)).not.toContain('secret_table');
  });

  it('logs an unexpected error exactly once, with the request id, path and stack', () => {
    run(new Error('boom'), { requestId: 'req-abc12345', method: 'POST', originalUrl: '/holds?promoCode=SECRET&email=a@b.co' });

    expect(error).toHaveBeenCalledTimes(1);
    const [message, stack] = error.mock.calls[0] ?? [];
    expect(message).toContain('req-abc12345');
    expect(message).toContain('POST /holds');
    expect(message).toContain('boom');
    expect(String(message)).not.toContain('SECRET');
    expect(String(message)).not.toContain('a@b.co');
    expect(String(stack)).toContain('Error: boom');
  });

  it('handles something thrown that is not an Error', () => {
    const captured = run('just a string');

    expect(captured.status).toBe(500);
    expect(error).toHaveBeenCalledTimes(1);
  });

  it('adds the request id to a 5xx HttpException but not to a 4xx', () => {
    expect(run(new HttpException('down', 503), { requestId: 'req-abc12345' }).body).toMatchObject({ requestId: 'req-abc12345' });
    expect(run(new BadRequestException('bad'), { requestId: 'req-abc12345' }).body).not.toHaveProperty('requestId');
  });

  it('sets Retry-After on a rate-limit 429', () => {
    const captured = run(new RateLimitedException('LOGIN_RATE_LIMITED', 'Slow down', 41.2));

    expect(captured.status).toBe(429);
    expect(captured.headers['Retry-After']).toBe('42');
    expect(captured.body).toEqual({ status: 'error', message: 'Slow down', code: 'LOGIN_RATE_LIMITED' });
  });

  it('never sets Retry-After below one second', () => {
    expect(run(new RateLimitedException('X', 'y', 0)).headers['Retry-After']).toBe('1');
  });
});

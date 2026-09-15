/**
 * @file apps/web/src/shared/services/api-client.ts
 * @shared Fetch helper for Nest JSON
 * @dependencies none
 */

import type { ApiErrorBody, ApiOkBody } from '@resort-booking/shared-types';

export class ApiRequestError extends Error {
  public readonly status: number;
  public readonly code: string | undefined;

  public constructor(message: string, status: number, code: string | undefined) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

/**
 * Reads JSON as unknown, then narrows to the ok envelope.
 */
export async function getApiOk<T>(path: string, init?: RequestInit): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';
  const response = await fetch(`${base}${path}`, {
    cache: 'no-store',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const error = asApiError(payload);
    throw new ApiRequestError(error.message, response.status, error.code);
  }
  if (!isApiOk<T>(payload)) {
    throw new ApiRequestError('Unexpected API response', response.status, 'BAD_RESPONSE');
  }
  return payload.data;
}

function isApiOk<T>(value: unknown): value is ApiOkBody<T> {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  if (!('status' in value) || !('data' in value)) {
    return false;
  }
  return value.status === 'ok';
}

function asApiError(value: unknown): ApiErrorBody {
  if (typeof value !== 'object' || value === null) {
    return { status: 'error', message: 'Request failed' };
  }
  const record = value as { message?: unknown; code?: unknown };
  const message = typeof record.message === 'string' ? record.message : 'Request failed';
  if (typeof record.code === 'string') {
    return { status: 'error', message, code: record.code };
  }
  return { status: 'error', message };
}

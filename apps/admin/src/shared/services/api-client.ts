/**
 * @file apps/admin/src/shared/services/api-client.ts
 * @shared Staff fetch helper
 * @dependencies none
 */

import type { ApiErrorBody, ApiOkBody } from '@resort-booking/shared-types';

export class ApiRequestError extends Error {
  public readonly status: number;

  public constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
}

/**
 * Calls Nest with the prototype staff token.
 */
export async function getStaffApiOk<T>(path: string): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';
  const token = process.env.NEXT_PUBLIC_STAFF_TOKEN ?? '';
  const response = await fetch(`${base}${path}`, {
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'x-staff-token': token,
    },
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof payload === 'object' &&
      payload !== null &&
      'message' in payload &&
      typeof (payload as ApiErrorBody).message === 'string'
        ? (payload as ApiErrorBody).message
        : 'Request failed';
    throw new ApiRequestError(message, response.status);
  }
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('status' in payload) ||
    (payload as ApiOkBody<T>).status !== 'ok'
  ) {
    throw new ApiRequestError('Unexpected API response', response.status);
  }
  return (payload as ApiOkBody<T>).data;
}

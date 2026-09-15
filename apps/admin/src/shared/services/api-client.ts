/**
 * @file apps/admin/src/shared/services/api-client.ts
 * @shared Staff fetch helper
 * @dependencies none
 */

import type { ApiErrorBody, ApiOkBody } from '@resort-booking/shared-types';

export const STAFF_TOKEN_STORAGE_KEY = 'staff_token';

export class ApiRequestError extends Error {
  public readonly status: number;

  public constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
  }
}

export async function resolveStaffToken(): Promise<string> {
  if (typeof window !== 'undefined') {
    return window.localStorage.getItem(STAFF_TOKEN_STORAGE_KEY) ?? '';
  }
  const { cookies } = await import('next/headers');
  return (await cookies()).get('staff_token')?.value ?? '';
}

export async function persistStaffSession(token: string): Promise<void> {
  window.localStorage.setItem(STAFF_TOKEN_STORAGE_KEY, token);
  await fetch('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
}

export async function clearStaffSession(): Promise<void> {
  window.localStorage.removeItem(STAFF_TOKEN_STORAGE_KEY);
  await fetch('/api/session', { method: 'DELETE' });
}

/**
 * Calls Nest with the signed-in staff session.
 */
export async function getStaffApiOk<T>(path: string): Promise<T> {
  return mutateStaffApiOk<T>(path, 'GET');
}

/**
 * JSON mutation against staff routes.
 */
export async function mutateStaffApiOk<T>(
  path: string,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  body?: unknown,
): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';
  const token = await resolveStaffToken();
  const headers: Record<string, string> = {
    'x-staff-token': token,
  };
  if (method !== 'GET' && method !== 'DELETE') {
    headers['Content-Type'] = 'application/json';
  }
  const init: RequestInit = {
    method,
    cache: 'no-store',
    headers,
  };
  if (body !== undefined && method !== 'GET') {
    init.body = JSON.stringify(body);
  }
  const response = await fetch(`${base}${path}`, init);
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

/**
 * Public login (no session header).
 */
export async function postStaffLogin<T>(email: string, password: string): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';
  const response = await fetch(`${base}/staff/login`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof payload === 'object' &&
      payload !== null &&
      'message' in payload &&
      typeof (payload as ApiErrorBody).message === 'string'
        ? (payload as ApiErrorBody).message
        : 'Could not sign in';
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

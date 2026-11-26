/**
 * @file apps/admin/src/shared/services/api-client.ts
 * @shared Staff fetch helper
 * @dependencies staff-session
 */

import type { ApiErrorBody, ApiOkBody } from '@resort-booking/shared-types';
import {
  STAFF_TOKEN_STORAGE_KEY,
  clearStoredStaffToken,
  readStoredStaffToken,
  storeStaffToken,
} from './staff-session';

export { STAFF_TOKEN_STORAGE_KEY };

/** Extra facts an error answer can carry: the machine code, and for a weak password every broken rule. */
export interface ApiErrorDetails {
  code?: string | undefined;
  problems?: string[] | undefined;
}

export class ApiRequestError extends Error {
  public readonly status: number;
  public readonly code: string | undefined;
  /** For PASSWORD_TOO_WEAK: each rule the new password breaks, in plain language. Empty otherwise. */
  public readonly problems: string[];

  public constructor(message: string, status: number, details: ApiErrorDetails = {}) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = details.code;
    this.problems = details.problems ?? [];
  }
}

/**
 * The code and the list of problems out of an error body (anything else in it is ignored).
 */
export function errorDetailsOf(payload: unknown): ApiErrorDetails {
  if (typeof payload !== 'object' || payload === null) {
    return {};
  }
  const body = payload as ApiErrorBody;
  const problems = Array.isArray(body.problems) && body.problems.every((item): boolean => typeof item === 'string') ? body.problems : undefined;
  return { code: typeof body.code === 'string' ? body.code : undefined, problems };
}

/** A 401 with one of these codes means "the password or code you typed is wrong", not "your session ended". */
const NOT_A_SESSION_FAILURES: ReadonlySet<string> = new Set(['STAFF_PASSWORD_MISMATCH', 'TWO_FACTOR_CODE_INVALID']);

export async function resolveStaffToken(): Promise<string> {
  if (typeof window !== 'undefined') {
    return readStoredStaffToken();
  }
  const { cookies } = await import('next/headers');
  return (await cookies()).get('staff_token')?.value ?? '';
}

export async function persistStaffSession(token: string): Promise<void> {
  storeStaffToken(token);
  await fetch('/api/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
}

export async function clearStaffSession(): Promise<void> {
  clearStoredStaffToken();
  await fetch('/api/session', { method: 'DELETE' });
}

/**
 * The API refused the session (expired, revoked, signed out elsewhere). Forget it and go to the login page.
 * Only in the browser, and never from the login page itself (no loop).
 */
function endSessionInBrowser(): void {
  if (typeof window === 'undefined' || window.location.pathname.startsWith('/login')) {
    return;
  }
  clearStoredStaffToken();
  void fetch('/api/session', { method: 'DELETE' }).catch((): void => undefined);
  window.location.assign('/login?reason=expired');
}

/**
 * The same refusal while a page is rendering on the server (a page that loads its data in a server component):
 * there is no browser to redirect, so send the visitor to the login page instead of crashing the page. The login
 * page clears the stale cookie when it sees `reason=expired`.
 */
async function endSessionOnServer(): Promise<void> {
  if (typeof window !== 'undefined') {
    return;
  }
  const { redirect } = await import('next/navigation');
  redirect('/login?reason=expired');
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
  const details = errorDetailsOf(payload);
  if (response.status === 401 && !(details.code !== undefined && NOT_A_SESSION_FAILURES.has(details.code))) {
    endSessionInBrowser();
    await endSessionOnServer();
  }
  if (!response.ok) {
    const message =
      typeof payload === 'object' &&
      payload !== null &&
      'message' in payload &&
      typeof (payload as ApiErrorBody).message === 'string'
        ? (payload as ApiErrorBody).message
        : 'Request failed';
    throw new ApiRequestError(message, response.status, details);
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
export function postStaffLogin<T>(email: string, password: string): Promise<T> {
  return postStaffPublic<T>('/staff/login', { email, password }, 'Could not sign in');
}

/**
 * Public POST (no session header): sign-in and its second step.
 */
export async function postStaffPublic<T>(path: string, body: unknown, failureMessage: string = 'Request failed'): Promise<T> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';
  const response = await fetch(`${base}${path}`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof payload === 'object' &&
      payload !== null &&
      'message' in payload &&
      typeof (payload as ApiErrorBody).message === 'string'
        ? (payload as ApiErrorBody).message
        : failureMessage;
    throw new ApiRequestError(message, response.status, errorDetailsOf(payload));
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

/**
 * @file apps/admin/src/shared/services/api-client.ts
 * @shared Staff fetch helper: the browser talks to this site's BFF (/api/proxy), server components to the API
 * @dependencies session-failures, server/bff-http (server side only)
 */

import type { ApiErrorBody, ApiOkBody, StaffSessionResult } from '@resort-booking/shared-types';
import { endsSession } from '../utils/session-failures';

/**
 * What a sign-in route answers in the browser: who signed in, but NEVER the token (the BFF put it in the httpOnly cookie).
 */
export interface SignedInAnswer extends Omit<StaffSessionResult, 'token'> {
  signedIn: true;
}

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

/** Where the browser sends API calls: this site's own BFF route (see app/api/proxy), never the API origin. */
const PROXY_PREFIX = '/api/proxy';

/**
 * The URL and headers for an API path. In the browser it is the same-origin proxy: the httpOnly cookie travels with the
 * request and the SERVER adds the session header, so no script ever holds the token. While a server component renders
 * there is no browser, so it calls the API directly with the token from the cookie (the token stays on the server).
 */
async function resolveTransport(path: string, withSession: boolean): Promise<{ url: string; headers: Record<string, string> }> {
  if (typeof window !== 'undefined') {
    return { url: `${PROXY_PREFIX}${path}`, headers: {} };
  }
  const { apiBaseUrl } = await import('../server/bff-http');
  const url = `${apiBaseUrl()}${path}`;
  if (!withSession) {
    return { url, headers: {} };
  }
  const { cookies } = await import('next/headers');
  return { url, headers: { 'x-staff-token': (await cookies()).get('staff_token')?.value ?? '' } };
}

/**
 * The URL of a public (no session) API path: the same-origin proxy in the browser, the API itself on the server.
 */
export async function publicApiUrl(path: string): Promise<string> {
  return (await resolveTransport(path, false)).url;
}

/** Signs this browser out locally: asks the server to drop the httpOnly cookie (the token itself is never in the page). */
export async function clearStaffSession(): Promise<void> {
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
  const { url, headers } = await resolveTransport(path, true);
  if (method !== 'GET' && method !== 'DELETE') {
    headers['Content-Type'] = 'application/json';
  }
  const init: RequestInit = {
    method,
    cache: 'no-store',
    credentials: 'same-origin',
    headers,
  };
  if (body !== undefined && method !== 'GET') {
    init.body = JSON.stringify(body);
  }
  const response = await fetch(url, init);
  const payload: unknown = await response.json();
  const details = errorDetailsOf(payload);
  if (response.status === 401 && endsSession(details.code)) {
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
 * Public login (no session). In the browser the BFF answers without a token; it is already in the httpOnly cookie.
 */
export function postStaffLogin<T>(email: string, password: string): Promise<T> {
  return postStaffPublic<T>('/staff/login', { email, password }, 'Could not sign in');
}

/**
 * Public POST (no session header): sign-in and its second step.
 */
export async function postStaffPublic<T>(path: string, body: unknown, failureMessage: string = 'Request failed'): Promise<T> {
  const { url } = await resolveTransport(path, false);
  const response = await fetch(url, {
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

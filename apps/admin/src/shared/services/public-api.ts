/**
 * @file apps/admin/src/shared/services/public-api.ts
 * @shared Fetch helper for the API routes that need no staff session (register, invitations)
 * @dependencies api-client (error type, same-origin URL)
 */

import type { ApiErrorBody, ApiOkBody } from '@resort-booking/shared-types';
import { ApiRequestError, errorDetailsOf, publicApiUrl } from './api-client';

/**
 * Calls a public Nest route and returns its `data`. Failures throw ApiRequestError with the API's message and code,
 * so a 404 invitation can be told apart from a network problem.
 */
export async function requestPublicApiOk<T>(path: string, method: 'GET' | 'POST', body?: unknown): Promise<T> {
  const init: RequestInit = { method, cache: 'no-store' };
  if (method === 'POST') {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body ?? {});
  }
  const response = await fetch(await publicApiUrl(path), init);
  const payload: unknown = await response.json().catch((): unknown => null);
  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload !== null && 'message' in payload && typeof (payload as ApiErrorBody).message === 'string'
        ? (payload as ApiErrorBody).message
        : 'Request failed';
    throw new ApiRequestError(message, response.status, errorDetailsOf(payload));
  }
  if (typeof payload !== 'object' || payload === null || !('status' in payload) || (payload as ApiOkBody<T>).status !== 'ok') {
    throw new ApiRequestError('Unexpected API response', response.status);
  }
  return (payload as ApiOkBody<T>).data;
}

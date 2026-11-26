/**
 * @file apps/admin/src/shared/services/public-api.test.ts
 * @shared
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from './api-client';
import { requestPublicApiOk } from './public-api';

function answer(status: number, body: unknown): void {
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status }))));
}

describe('requestPublicApiOk', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns data of an ok body', async () => {
    answer(200, { status: 'ok', data: { open: true } });
    await expect(requestPublicApiOk('/staff/register/status', 'GET')).resolves.toEqual({ open: true });
  });

  it('sends JSON for a POST and no session header', async () => {
    answer(200, { status: 'ok', data: 1 });
    await requestPublicApiOk('/staff/register', 'POST', { a: 1 });
    const call = vi.mocked(fetch).mock.calls[0];
    const init = call?.[1];
    expect(init?.body).toBe('{"a":1}');
    expect(JSON.stringify(init?.headers)).not.toContain('x-staff-token');
  });

  it('throws ApiRequestError with status, message and code', async () => {
    answer(404, { status: 'error', message: 'This link is not valid any more.', code: 'INVITE_INVALID' });
    const error = await requestPublicApiOk('/staff/invites/x/preview', 'GET').catch((err: unknown): unknown => err);
    expect(error).toBeInstanceOf(ApiRequestError);
    expect((error as ApiRequestError).status).toBe(404);
    expect((error as ApiRequestError).code).toBe('INVITE_INVALID');
  });

  it('survives a non-JSON error body', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response('Bad gateway', { status: 502 }))));
    await expect(requestPublicApiOk('/x', 'GET')).rejects.toMatchObject({ status: 502, message: 'Request failed' });
  });
});

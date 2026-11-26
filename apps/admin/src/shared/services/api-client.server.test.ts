// @vitest-environment node
/**
 * @file apps/admin/src/shared/services/api-client.server.test.ts
 * @shared A page that loads staff data on the server sends a refused session to the login page
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.hoisted(() => ({
  redirect: vi.fn((path: string): never => {
    throw new Error(`NEXT_REDIRECT ${path}`);
  }),
}));
vi.mock('next/navigation', () => ({ redirect: nav.redirect }));
vi.mock('next/headers', () => ({
  cookies: async (): Promise<{ get: (name: string) => { value: string } | undefined }> => ({
    get: (name: string): { value: string } | undefined => (name === 'staff_token' ? { value: 'stale-token' } : undefined),
  }),
}));

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('api-client on the server', () => {
  beforeEach(() => {
    nav.redirect.mockClear();
    vi.stubEnv('API_URL', 'https://api.internal.example');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('calls the API itself with the cookie token (it never reaches a browser) and, when the API refuses the session, redirects to the login page', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(401, { status: 'error', message: 'Staff authentication required' }));
    vi.stubGlobal('fetch', fetchMock);
    const { getStaffApiOk } = await import('./api-client');

    await expect(getStaffApiOk('/staff/properties')).rejects.toThrow('NEXT_REDIRECT /login?reason=expired');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.internal.example/staff/properties');
    expect((init.headers as Record<string, string>)['x-staff-token']).toBe('stale-token');
    expect(nav.redirect).toHaveBeenCalledWith('/login?reason=expired');
  });

  it('does not redirect for other failures: they stay errors the page can show', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(404, { status: 'error', message: 'Not found' })));
    const { getStaffApiOk, ApiRequestError } = await import('./api-client');

    await expect(getStaffApiOk('/staff/properties/x')).rejects.toBeInstanceOf(ApiRequestError);
    expect(nav.redirect).not.toHaveBeenCalled();
  });

  it('does not redirect when the 401 only means the typed password was wrong', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json(401, { status: 'error', message: 'Wrong password', code: 'STAFF_PASSWORD_MISMATCH' })));
    const { mutateStaffApiOk, ApiRequestError } = await import('./api-client');

    await expect(mutateStaffApiOk('/staff/me/password', 'POST', {})).rejects.toBeInstanceOf(ApiRequestError);
    expect(nav.redirect).not.toHaveBeenCalled();
  });
});

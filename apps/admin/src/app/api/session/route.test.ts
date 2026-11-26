// @vitest-environment node
/**
 * @file apps/admin/src/app/api/session/route.test.ts
 * @shared The session cookie route: same-origin only, shape check, API confirmation, cookie flags
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETE, POST } from './route';

const TOKEN = 'ab'.repeat(32);
const HOST = 'admin.example.com';

function post(body: BodyInit, headers: Record<string, string> = {}): Request {
  return new Request(`https://${HOST}/api/session`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: `https://${HOST}`, host: HOST, ...headers },
    body,
  });
}

function jsonToken(token: unknown): string {
  return JSON.stringify({ token });
}

describe('POST /api/session', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.example.com');
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('confirms the token with the API, then sets an httpOnly, Secure, SameSite=Lax cookie', async () => {
    const response = await POST(post(jsonToken(TOKEN)));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.example.com/staff/me');
    expect(init.headers).toEqual({ 'x-staff-token': TOKEN });
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toContain(`staff_token=${TOKEN}`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=lax/i);
    expect(cookie).toContain('Path=/');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('leaves Secure off only for an explicit `next dev` run', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect((await POST(post(jsonToken(TOKEN)))).headers.get('set-cookie')).not.toMatch(/Secure/i);

    vi.stubEnv('NODE_ENV', 'staging');
    expect((await POST(post(jsonToken(TOKEN)))).headers.get('set-cookie')).toMatch(/Secure/i);
  });

  it('refuses a cross-site request before reading the body or calling the API', async () => {
    const crossSite = await POST(post(jsonToken(TOKEN), { 'sec-fetch-site': 'cross-site' }));
    const wrongOrigin = await POST(post(jsonToken(TOKEN), { origin: 'https://evil.example.net' }));
    const noOrigin = new Request(`https://${HOST}/api/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', host: HOST },
      body: jsonToken(TOKEN),
    });

    expect(crossSite.status).toBe(403);
    expect(wrongOrigin.status).toBe(403);
    expect((await POST(noOrigin)).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(crossSite.headers.get('set-cookie')).toBeNull();
  });

  it('accepts a same-origin Sec-Fetch-Site and the forwarded host behind a proxy', async () => {
    expect((await POST(post(jsonToken(TOKEN), { 'sec-fetch-site': 'same-origin', origin: '' }))).status).toBe(200);
    const proxied = post(jsonToken(TOKEN), { host: 'internal:3001', 'x-forwarded-host': HOST });
    expect((await POST(proxied)).status).toBe(200);
  });

  it('refuses a body that is not JSON (a cross-site text/plain form post)', async () => {
    const response = await POST(post(jsonToken(TOKEN), { 'content-type': 'text/plain' }));

    expect(response.status).toBe(415);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers 400 for broken JSON, a missing token or a token of the wrong shape, never a 500', async () => {
    for (const body of ['{not json', '{}', jsonToken(123), jsonToken(''), jsonToken('short'), jsonToken('Z'.repeat(64)), '"x"', 'null']) {
      const response = await POST(post(body));
      expect(response.status).toBe(400);
      expect(response.headers.get('set-cookie')).toBeNull();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stores nothing when the API does not accept the token (401) or cannot be reached', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 401 }));
    const rejected = await POST(post(jsonToken(TOKEN)));
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 500 }));
    const failing = await POST(post(jsonToken(TOKEN)));
    fetchMock.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
    const down = await POST(post(jsonToken(TOKEN)));

    expect(rejected.status).toBe(401);
    expect(failing.status).toBe(502);
    expect(down.status).toBe(502);
    for (const response of [rejected, failing, down]) {
      expect(response.headers.get('set-cookie')).toBeNull();
    }
  });
});

describe('DELETE /api/session', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('clears the cookie with the same flags for a same-origin request', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const request = new Request(`https://${HOST}/api/session`, { method: 'DELETE', headers: { origin: `https://${HOST}`, host: HOST } });

    const response = await DELETE(request);

    expect(response.status).toBe(200);
    const cookie = response.headers.get('set-cookie') ?? '';
    expect(cookie).toContain('staff_token=;');
    expect(cookie).toMatch(/Max-Age=0/i);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
  });

  it('refuses a cross-site sign-out', async () => {
    const request = new Request(`https://${HOST}/api/session`, { method: 'DELETE', headers: { 'sec-fetch-site': 'cross-site', host: HOST } });

    const response = await DELETE(request);

    expect(response.status).toBe(403);
    expect(response.headers.get('set-cookie')).toBeNull();
  });
});

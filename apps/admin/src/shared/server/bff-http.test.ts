// @vitest-environment node
/**
 * @file apps/admin/src/shared/server/bff-http.test.ts
 * @shared BFF rules: path allow-list, same-origin, header allow-lists, cookie flags, body limits
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  apiBaseUrl,
  classifyRoute,
  clearedSessionCookie,
  isProxyMethod,
  isSameOrigin,
  readLimited,
  relayedHeaders,
  sessionCookie,
  upstreamHeaders,
  upstreamPathOf,
  upstreamQueryOf,
} from './bff-http';

function streamOf(...chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller): void {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('upstreamPathOf', () => {
  it('only accepts /staff/... with plain segments', () => {
    expect(upstreamPathOf(['staff', 'me'])).toBe('/staff/me');
    expect(upstreamPathOf(['staff', 'team', '3f2a9c1e-0000-4000-8000-000000000001', 'reset-access'])).toBe('/staff/team/3f2a9c1e-0000-4000-8000-000000000001/reset-access');
  });

  it('refuses everything outside /staff: the API root, payments, health, other apps', () => {
    for (const segments of [[], ['staff'], ['payments', 'webhooks', 'x'], ['health'], ['identity', 'organization'], ['staffx', 'me'], ['api', 'session']]) {
      expect(upstreamPathOf(segments), segments.join('/')).toBeNull();
    }
  });

  it('refuses traversal, encoded characters, empty segments and odd characters', () => {
    for (const segments of [
      ['staff', '..', 'payments'],
      ['staff', '.', 'me'],
      ['staff', 'me', ''],
      ['staff', '%2e%2e', 'x'],
      ['staff', 'a/b'],
      ['staff', 'a\\b'],
      ['staff', 'me?x=1'],
      ['staff', 'me#x'],
      ['staff', 'a b'],
      ['staff', 'x'.repeat(101)],
    ]) {
      expect(upstreamPathOf(segments), segments.join('|')).toBeNull();
    }
  });
});

describe('upstreamQueryOf', () => {
  it('passes a normal query, refuses control characters and over-long targets', () => {
    expect(upstreamQueryOf('?from=2027-07-01&to=2027-08-01', '/staff/reports')).toBe('?from=2027-07-01&to=2027-08-01');
    expect(upstreamQueryOf('', '/staff/me')).toBe('');
    expect(upstreamQueryOf('?a=1\r\nX-Evil: 1', '/staff/me')).toBeNull();
    expect(upstreamQueryOf(`?q=${'a'.repeat(3000)}`, '/staff/me')).toBeNull();
  });
});

describe('classifyRoute', () => {
  it('knows the sign-in posts, the public reads and sign-out; everything else under /staff needs the session', () => {
    expect(classifyRoute('POST', '/staff/login')).toBe('auth');
    expect(classifyRoute('POST', '/staff/login/two-factor')).toBe('auth');
    expect(classifyRoute('POST', '/staff/register')).toBe('auth');
    expect(classifyRoute('POST', '/staff/invites/accept')).toBe('auth');
    expect(classifyRoute('POST', '/staff/logout')).toBe('logout');
    expect(classifyRoute('GET', '/staff/register/status')).toBe('public');
    expect(classifyRoute('GET', '/staff/invites/abc123/preview')).toBe('public');
    expect(classifyRoute('POST', '/staff/invites/preview')).toBe('public');
    expect(classifyRoute('GET', '/staff/me')).toBe('session');
    expect(classifyRoute('DELETE', '/staff/me/sessions/abc')).toBe('session');
  });

  it('does not treat a GET of a sign-in path as public, and never lets a public read take another method', () => {
    expect(classifyRoute('GET', '/staff/login')).toBe('session');
    expect(classifyRoute('DELETE', '/staff/register/status')).toBe('session');
    expect(classifyRoute('GET', '/staff/invites/abc/accept')).toBe('session');
  });

  it('refuses a path outside /staff', () => {
    expect(classifyRoute('GET', '/payments')).toBeNull();
  });
});

describe('isProxyMethod', () => {
  it('allows the five API methods only', () => {
    for (const method of ['GET', 'POST', 'PATCH', 'PUT', 'DELETE']) {
      expect(isProxyMethod(method)).toBe(true);
    }
    for (const method of ['HEAD', 'OPTIONS', 'TRACE', 'CONNECT', 'get']) {
      expect(isProxyMethod(method)).toBe(false);
    }
  });
});

describe('isSameOrigin', () => {
  it('trusts Sec-Fetch-Site first', () => {
    expect(isSameOrigin(new Headers({ 'sec-fetch-site': 'same-origin' }))).toBe(true);
    for (const site of ['cross-site', 'same-site', 'none']) {
      expect(isSameOrigin(new Headers({ 'sec-fetch-site': site, origin: 'https://admin.example.com', host: 'admin.example.com' }))).toBe(false);
    }
  });

  it('falls back to Origin against the (forwarded) host, and refuses a request with neither', () => {
    expect(isSameOrigin(new Headers({ origin: 'https://admin.example.com', host: 'admin.example.com' }))).toBe(true);
    expect(isSameOrigin(new Headers({ origin: 'https://admin.example.com', host: 'internal:3001', 'x-forwarded-host': 'admin.example.com' }))).toBe(true);
    expect(isSameOrigin(new Headers({ origin: 'https://evil.example.net', host: 'admin.example.com' }))).toBe(false);
    expect(isSameOrigin(new Headers({ origin: 'not a url', host: 'admin.example.com' }))).toBe(false);
    expect(isSameOrigin(new Headers({ host: 'admin.example.com' }))).toBe(false);
    expect(isSameOrigin(new Headers())).toBe(false);
  });
});

describe('upstreamHeaders', () => {
  it('builds from an allow-list: no cookie, authorization, origin, host or hop-by-hop header gets through', () => {
    const incoming = new Headers({
      cookie: 'staff_token=secret; other=1',
      authorization: 'Bearer x',
      origin: 'https://admin.example.com',
      host: 'admin.example.com',
      connection: 'keep-alive',
      'transfer-encoding': 'chunked',
      'proxy-authorization': 'x',
      'x-staff-token': 'forged-by-the-browser',
      'content-type': 'application/json',
      accept: 'application/json',
      'user-agent': 'Mozilla/5.0 Test',
      'x-forwarded-for': '203.0.113.7',
      'x-request-id': 'req-12345678',
    });

    const out = upstreamHeaders(incoming, null);

    expect([...out.keys()].sort()).toEqual(['accept', 'content-type', 'user-agent', 'x-forwarded-for', 'x-request-id']);
    expect(out.get('x-staff-token')).toBeNull();
  });

  it('adds the session token itself, and drops a malformed request id', () => {
    const out = upstreamHeaders(new Headers({ 'x-request-id': 'bad id with spaces' }), 'ab'.repeat(32));

    expect(out.get('x-staff-token')).toBe('ab'.repeat(32));
    expect(out.get('x-request-id')).toBeNull();
  });
});

describe('relayedHeaders', () => {
  it('relays type, download name, request id and Retry-After; never Set-Cookie or the API cache and CORS headers; always no-store', () => {
    const out = relayedHeaders(
      new Headers({
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': 'attachment; filename="r.csv"',
        'x-request-id': 'req-12345678',
        'retry-after': '30',
        'set-cookie': 'a=b',
        'access-control-allow-origin': '*',
        'cache-control': 'public, max-age=999',
        'content-length': '10',
        'transfer-encoding': 'chunked',
      }),
    );

    expect([...out.keys()].sort()).toEqual(['cache-control', 'content-disposition', 'content-type', 'retry-after', 'x-request-id']);
    expect(out.get('cache-control')).toBe('no-store');
  });
});

describe('sessionCookie / clearedSessionCookie', () => {
  it('is httpOnly, SameSite=Lax, Secure outside `next dev`, and ends with the session', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const end = new Date(Date.now() + 3_600_000).toISOString();

    const cookie = sessionCookie('ab'.repeat(32), end);

    expect(cookie).toMatchObject({ name: 'staff_token', httpOnly: true, sameSite: 'lax', secure: true, path: '/' });
    expect(cookie.expires.toISOString()).toBe(end);
    expect(clearedSessionCookie()).toMatchObject({ value: '', maxAge: 0, httpOnly: true, secure: true });
  });

  it('turns Secure off only for NODE_ENV=development', () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(sessionCookie('t', undefined).secure).toBe(false);
    vi.stubEnv('NODE_ENV', 'staging');
    expect(sessionCookie('t', undefined).secure).toBe(true);
  });

  it('falls back to 12 hours when the API gives no usable expiry (never a past or junk date)', () => {
    for (const bad of [undefined, 'junk', '2000-01-01T00:00:00Z']) {
      const hours = (sessionCookie('t', bad).expires.getTime() - Date.now()) / 3_600_000;
      expect(hours).toBeGreaterThan(11.9);
      expect(hours).toBeLessThan(12.1);
    }
  });
});

describe('apiBaseUrl', () => {
  it('prefers API_URL, then NEXT_PUBLIC_API_URL, then localhost, without a trailing slash', () => {
    vi.stubEnv('API_URL', '');
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    expect(apiBaseUrl()).toBe('http://localhost:3002');
    vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://old.example.com/');
    expect(apiBaseUrl()).toBe('https://old.example.com');
    vi.stubEnv('API_URL', 'https://api.internal');
    expect(apiBaseUrl()).toBe('https://api.internal');
  });
});

describe('readLimited', () => {
  it('joins the chunks, and stops with null as soon as the limit is passed', async () => {
    const bytes = await readLimited(streamOf(new Uint8Array([1, 2]), new Uint8Array([3])), 10);
    expect([...(bytes ?? [])]).toEqual([1, 2, 3]);
    expect(await readLimited(streamOf(new Uint8Array(6), new Uint8Array(6)), 10)).toBeNull();
    expect((await readLimited(null, 10))?.byteLength).toBe(0);
  });
});

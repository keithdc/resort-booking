/**
 * @file apps/admin/src/shared/server/bff-http.ts
 * @shared Server-only helpers of the same-origin BFF: path allow-list, same-origin check, header filtering, cookie flags
 * @dependencies none
 *
 * docs/10 S-11 and docs/13 R2-09: the browser never holds the staff session token. It calls `/api/proxy/staff/...` on
 * this site; the route handler reads the httpOnly cookie and calls the API. These helpers are pure so every rule is
 * unit-tested. Only `apiBaseUrl` is also reached from the shared api-client (on its server side).
 */

export const STAFF_COOKIE_NAME = 'staff_token';

/** What the API's createSessionToken() returns: 32 random bytes as hex. */
export const TOKEN_SHAPE = /^[0-9a-f]{64}$/;

/** Fallback cookie lifetime when the API gives no usable expiry: the longest default session (employees, 12 hours). */
const FALLBACK_COOKIE_SECONDS = 12 * 60 * 60;

/** Largest request body the proxy forwards (the API itself refuses JSON over 100 kB). */
export const MAX_REQUEST_BYTES = 1024 * 1024;
/** Largest answer the proxy relays. */
export const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
/** How long the proxy waits for the API. */
export const UPSTREAM_TIMEOUT_MS = 30_000;
/** Longest path plus query the proxy accepts (the API refuses URLs over 2048 characters too). */
const MAX_TARGET_LENGTH = 2048;

/** The API origin as the SERVER sees it (never sent to the browser). `API_URL` wins; `NEXT_PUBLIC_API_URL` still works. */
export function apiBaseUrl(): string {
  const configured = [process.env.API_URL, process.env.NEXT_PUBLIC_API_URL].find((value): boolean => value !== undefined && value !== '');
  return (configured ?? 'http://localhost:3002').replace(/\/+$/, '');
}

/**
 * Cookie flags: httpOnly (no script can read it), SameSite=Lax, `Secure` everywhere except an explicit `next dev` run
 * (plain http on localhost). `expires` is the session's own absolute end, so the cookie never outlives the server session.
 */
export function sessionCookie(
  token: string,
  expiresAt: string | undefined,
): { name: string; value: string; httpOnly: true; sameSite: 'lax'; secure: boolean; path: string; expires: Date } {
  const parsed = expiresAt === undefined ? Number.NaN : Date.parse(expiresAt);
  const expires = Number.isFinite(parsed) && parsed > Date.now() ? new Date(parsed) : new Date(Date.now() + FALLBACK_COOKIE_SECONDS * 1000);
  return {
    name: STAFF_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV !== 'development',
    path: '/',
    expires,
  };
}

/** The same cookie, expired now (sign-out, or the API said the session is over). */
export function clearedSessionCookie(): {
  name: string;
  value: string;
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return { name: STAFF_COOKIE_NAME, value: '', httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV !== 'development', path: '/', maxAge: 0 };
}

/**
 * Is this request from a page of this very site? Browsers send Sec-Fetch-Site on every fetch (a page script cannot set
 * or change it); the Origin header is the fallback. A request with neither (curl, a script on a server) is refused.
 */
export function isSameOrigin(headers: Headers): boolean {
  const fetchSite = headers.get('sec-fetch-site');
  if (fetchSite !== null) {
    return fetchSite === 'same-origin';
  }
  const origin = headers.get('origin');
  const host = headers.get('x-forwarded-host') ?? headers.get('host');
  if (origin === null || host === null) {
    return false;
  }
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** What the proxy does with a request. */
export type RouteKind =
  /** Needs the cookie; the cookie's token is sent as x-staff-token. */
  | 'session'
  /** Sign-in style POST: no token is sent; a token in the answer becomes the cookie and never reaches the browser. */
  | 'auth'
  /** Public read: no token is sent. */
  | 'public'
  /** Sign-out: revoke on the API, then clear the cookie whatever the API says. */
  | 'logout';

/** Allowed methods of the proxy. */
export type ProxyMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
const METHODS: ReadonlySet<string> = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']);

/** True for the five methods the proxy forwards. */
export function isProxyMethod(method: string): method is ProxyMethod {
  return METHODS.has(method);
}

const AUTH_POSTS: ReadonlySet<string> = new Set(['/staff/login', '/staff/login/two-factor', '/staff/register', '/staff/invites/accept']);
const PUBLIC_GET_PATTERNS: readonly RegExp[] = [/^\/staff\/register\/status$/, /^\/staff\/invites\/[A-Za-z0-9_-]{1,200}\/preview$/];
const SEGMENT = /^[A-Za-z0-9._~-]{1,100}$/;

/**
 * The API path for the segments after `/api/proxy`, or null when it is not an acceptable `/staff/...` path. Each segment
 * is plain characters only (no `%`, no slash, no dot-only segment), so nothing can climb out of `/staff` or smuggle a query.
 */
export function upstreamPathOf(segments: readonly string[]): string | null {
  if (segments.length < 2 || segments[0] !== 'staff') {
    return null;
  }
  for (const segment of segments) {
    if (!SEGMENT.test(segment) || segment === '.' || segment === '..') {
      return null;
    }
  }
  return `/${segments.join('/')}`;
}

function hasControlCharacter(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 32 || code === 127) {
      return true;
    }
  }
  return false;
}

/** The query string to forward (with its `?`), '' when none, or null when it is too long or has control characters. */
export function upstreamQueryOf(search: string, path: string): string | null {
  if (search.length + path.length > MAX_TARGET_LENGTH || hasControlCharacter(search)) {
    return null;
  }
  return search;
}

/**
 * How this method + path is handled, or null when the proxy refuses it (an allow-list: only `/staff/*`, and only
 * these public and sign-in routes go out without a session).
 */
export function classifyRoute(method: ProxyMethod, path: string): RouteKind | null {
  if (method === 'POST' && AUTH_POSTS.has(path)) {
    return 'auth';
  }
  if (method === 'POST' && path === '/staff/logout') {
    return 'logout';
  }
  if (method === 'POST' && path === '/staff/invites/preview') {
    return 'public';
  }
  if (method === 'GET' && PUBLIC_GET_PATTERNS.some((pattern: RegExp): boolean => pattern.test(path))) {
    return 'public';
  }
  return path.startsWith('/staff/') ? 'session' : null;
}

/**
 * The headers sent to the API, built from nothing (an allow-list, so a cookie, an Authorization header, the browser's
 * Origin or any hop-by-hop header can never be forwarded by accident). The session token is added by the caller.
 */
export function upstreamHeaders(incoming: Headers, token: string | null): Headers {
  const out = new Headers();
  for (const name of ['content-type', 'accept', 'user-agent']) {
    const value = incoming.get(name);
    if (value !== null && value !== '') {
      out.set(name, value);
    }
  }
  // The API sees this server as its caller: pass on the address the edge proxy recorded, so rate limits and the audit
  // hash use the person's address (the API counts TRUST_PROXY hops, docs/01 deployment notes).
  const forwarded = incoming.get('x-forwarded-for');
  if (forwarded !== null && forwarded !== '') {
    out.set('x-forwarded-for', forwarded);
  }
  const requestId = incoming.get('x-request-id');
  if (requestId !== null && /^[A-Za-z0-9._-]{8,64}$/.test(requestId)) {
    out.set('x-request-id', requestId);
  }
  if (token !== null) {
    out.set('x-staff-token', token);
  }
  return out;
}

/**
 * The headers relayed to the browser: type, download name, a request id and Retry-After. Never Set-Cookie, never the
 * API's CORS or cache headers; the answer is always `no-store`.
 */
export function relayedHeaders(upstream: Headers): Headers {
  const out = new Headers();
  for (const name of ['content-type', 'content-disposition', 'x-request-id', 'retry-after']) {
    const value = upstream.get(name);
    if (value !== null) {
      out.set(name, value);
    }
  }
  out.set('Cache-Control', 'no-store');
  return out;
}

/** Bytes held in an ordinary ArrayBuffer, which `fetch` and `Response` accept as a body. */
export type Bytes = Uint8Array<ArrayBuffer>;

/**
 * Reads a stream into memory, stopping with null as soon as it is over `limit` bytes.
 */
export async function readLimited(stream: ReadableStream<Uint8Array> | null, limit: number): Promise<Bytes | null> {
  if (stream === null) {
    return new Uint8Array(0);
  }
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const joined: Bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
}

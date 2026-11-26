/**
 * @file apps/admin/src/app/api/proxy/[...path]/route.ts
 * @shared Same-origin BFF: the browser calls this, this calls the API with the session from the httpOnly cookie
 * @dependencies bff-http, session-failures
 *
 * docs/10 S-11, docs/13 R2-09: the staff session token lives ONLY in an httpOnly cookie that browser JavaScript cannot
 * read. This route is not an open proxy: it only forwards `/staff/*`, only same-origin browser requests, an allow-listed
 * set of request and response headers, bounded body sizes and a timeout. Sign-in routes pass through here too: the
 * token the API returns goes into the cookie and is removed from the answer, so no script ever receives it.
 */

import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import {
  MAX_REQUEST_BYTES,
  MAX_RESPONSE_BYTES,
  TOKEN_SHAPE,
  UPSTREAM_TIMEOUT_MS,
  STAFF_COOKIE_NAME,
  type Bytes,
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
  type ProxyMethod,
  type RouteKind,
} from '@/shared/server/bff-http';
import { endsSession } from '@/shared/utils/session-failures';

interface RouteContext {
  params: Promise<{ path: string[] }>;
}

function errorAnswer(status: number, message: string, code?: string): NextResponse {
  return NextResponse.json(
    { status: 'error', message, ...(code === undefined ? {} : { code }) },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

/** The session is gone (no cookie, junk cookie, or the API said so): answer 401 and drop the cookie. */
function sessionEnded(): NextResponse {
  const response = errorAnswer(401, 'Staff authentication required', 'STAFF_UNAUTHORIZED');
  response.cookies.set(clearedSessionCookie());
  return response;
}

/** The JSON of an answer, or null when it is not JSON. */
function parseJson(bytes: Bytes): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/** The `code` of an error body, when it has one. */
function codeOf(payload: unknown): string | undefined {
  return typeof payload === 'object' && payload !== null && 'code' in payload && typeof payload.code === 'string' ? payload.code : undefined;
}

interface TokenAnswer {
  token: string;
  expiresAt: string | undefined;
  rest: Record<string, unknown>;
}

/** The session the API opened (`data.token`), or null when the answer holds none (for example a two-factor challenge). */
function sessionOf(payload: unknown): TokenAnswer | null {
  if (typeof payload !== 'object' || payload === null || !('data' in payload)) {
    return null;
  }
  const data: unknown = payload.data;
  if (typeof data !== 'object' || data === null || !('token' in data) || typeof data.token !== 'string' || !TOKEN_SHAPE.test(data.token)) {
    return null;
  }
  const { token, ...rest } = data as Record<string, unknown> & { token: string };
  return { token, expiresAt: typeof rest.expiresAt === 'string' ? rest.expiresAt : undefined, rest };
}

/** A sign-in answer: the token goes into the cookie and out of the body. */
function authAnswer(status: number, headers: Headers, body: Bytes): NextResponse {
  const session = status >= 200 && status < 300 ? sessionOf(parseJson(body)) : null;
  if (session === null) {
    return new NextResponse(body, { status, headers });
  }
  const response = NextResponse.json({ status: 'ok', data: { ...session.rest, signedIn: true } }, { status, headers: { 'Cache-Control': 'no-store' } });
  response.cookies.set(sessionCookie(session.token, session.expiresAt));
  return response;
}

/** The API call: false for "could not reach it" (with the status to answer). */
async function callApi(
  method: ProxyMethod,
  target: string,
  headers: Headers,
  body: Bytes | undefined,
): Promise<{ response: Response; bytes: Bytes } | { failure: NextResponse }> {
  try {
    const init: RequestInit = { method, headers, cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) };
    if (body !== undefined && body.byteLength > 0) {
      init.body = body;
    }
    const response = await fetch(target, init);
    const bytes = await readLimited(response.body, MAX_RESPONSE_BYTES);
    if (bytes === null) {
      return { failure: errorAnswer(502, 'The server answered with too much data') };
    }
    return { response, bytes };
  } catch (error: unknown) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return { failure: timedOut ? errorAnswer(504, 'The server took too long to answer') : errorAnswer(502, 'Could not reach the server') };
  }
}

async function tokenFromCookie(): Promise<string | null> {
  const value = (await cookies()).get(STAFF_COOKIE_NAME)?.value;
  return value !== undefined && TOKEN_SHAPE.test(value) ? value : null;
}

/** Everything the proxy does, for every method. */
async function handle(request: NextRequest, context: RouteContext): Promise<NextResponse> {
  const method = request.method;
  if (!isProxyMethod(method)) {
    return errorAnswer(405, 'Method not allowed');
  }
  if (!isSameOrigin(request.headers)) {
    return errorAnswer(403, 'Cross-site request refused');
  }
  const path = upstreamPathOf((await context.params).path);
  const query = path === null ? null : upstreamQueryOf(request.nextUrl.search, path);
  const kind: RouteKind | null = path === null || query === null ? null : classifyRoute(method, path);
  if (path === null || query === null || kind === null) {
    return errorAnswer(404, 'Not found');
  }

  const token = kind === 'session' || kind === 'logout' ? await tokenFromCookie() : null;
  if (kind === 'session' && token === null) {
    return sessionEnded();
  }
  if (kind === 'logout' && token === null) {
    const response = NextResponse.json({ status: 'ok', data: { loggedOut: true } }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(clearedSessionCookie());
    return response;
  }

  if (kind === 'auth' && !(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return errorAnswer(415, 'Send JSON');
  }
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) {
    return errorAnswer(413, 'Request too large');
  }
  const body = method === 'GET' ? undefined : await readLimited(request.body, MAX_REQUEST_BYTES);
  if (body === null) {
    return errorAnswer(413, 'Request too large');
  }

  const called = await callApi(method, `${apiBaseUrl()}${path}${query}`, upstreamHeaders(request.headers, token), body);
  if ('failure' in called) {
    if (kind === 'logout') {
      called.failure.cookies.set(clearedSessionCookie());
    }
    return called.failure;
  }
  const { response: upstream, bytes } = called;
  const headers = relayedHeaders(upstream.headers);

  if (kind === 'auth') {
    return authAnswer(upstream.status, headers, bytes);
  }
  if (kind === 'logout') {
    const response = NextResponse.json({ status: 'ok', data: { loggedOut: true } }, { headers: { 'Cache-Control': 'no-store' } });
    response.cookies.set(clearedSessionCookie());
    return response;
  }
  const relayed = new NextResponse(upstream.status === 204 || upstream.status === 304 ? null : bytes, { status: upstream.status, headers });
  if (upstream.status === 401 && endsSession(codeOf(parseJson(bytes)))) {
    relayed.cookies.set(clearedSessionCookie());
  }
  return relayed;
}

export { handle as GET, handle as POST, handle as PATCH, handle as PUT, handle as DELETE };

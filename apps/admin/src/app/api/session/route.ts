/**
 * @file apps/admin/src/app/api/session/route.ts
 * @shared Stores and clears the staff session cookie for server components and the route guard (middleware)
 * @dependencies none
 *
 * Hardening for docs/13 R2-09 (and the interim state of docs/10 S-11):
 * - only a same-origin browser request is accepted (Sec-Fetch-Site / Origin), so another site cannot set or clear
 *   the cookie with a cross-site form post (login CSRF, session fixation);
 * - the body must be JSON and the token must have the shape the API issues (64 hex characters);
 * - the token is confirmed with the API (GET /staff/me) before it is stored, so the cookie never holds junk;
 * - the cookie is httpOnly, SameSite=Lax and Secure everywhere except an explicit `next dev` run.
 * The browser still keeps a copy in localStorage for its own API calls (see staff-session.ts): the real fix is the
 * BFF design (S-11, Phase 2), after which the browser never holds the token.
 */

import { NextResponse } from 'next/server';

const COOKIE_NAME = 'staff_token';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
/** What the API's createSessionToken() returns: 32 random bytes as hex. */
const TOKEN_SHAPE = /^[0-9a-f]{64}$/;
const VERIFY_TIMEOUT_MS = 5000;

/**
 * Cookie flags. `Secure` everywhere except `next dev` (plain http on localhost): a missing or odd NODE_ENV stays secure.
 */
function cookieOptions(maxAge: number): {
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  path: string;
  maxAge: number;
} {
  return { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV !== 'development', path: '/', maxAge };
}

function refuse(status: number, message: string): NextResponse {
  return NextResponse.json({ status: 'error', message }, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Is this request from a page of this very site? Browsers send Sec-Fetch-Site on every fetch (and it cannot be set by
 * a page script); the Origin header is the fallback. A request with neither is refused.
 */
function isSameOrigin(request: Request): boolean {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite !== null) {
    return fetchSite === 'same-origin';
  }
  const origin = request.headers.get('origin');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (origin === null || host === null) {
    return false;
  }
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Asks the API whether this token is a live session. 'ok', 'rejected' (the API says it is not a session) or
 * 'unavailable' (the API could not be reached or failed: nothing is stored).
 */
async function verifyWithApi(token: string): Promise<'ok' | 'rejected' | 'unavailable'> {
  const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002';
  try {
    const response = await fetch(`${base}/staff/me`, {
      headers: { 'x-staff-token': token },
      cache: 'no-store',
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    if (response.ok) {
      return 'ok';
    }
    return response.status === 401 || response.status === 403 ? 'rejected' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

/**
 * Reads the token out of the JSON body; null for anything that is not a well-formed session token.
 */
async function readToken(request: Request): Promise<string | null> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return null;
  }
  if (typeof payload !== 'object' || payload === null || !('token' in payload)) {
    return null;
  }
  const token: unknown = payload.token;
  return typeof token === 'string' && TOKEN_SHAPE.test(token) ? token : null;
}

/**
 * Sets the httpOnly cookie the middleware and server-component reads use, after the API confirmed the token.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!isSameOrigin(request)) {
    return refuse(403, 'Cross-site request refused');
  }
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return refuse(415, 'Send JSON');
  }
  const token = await readToken(request);
  if (token === null) {
    return refuse(400, 'Missing or malformed token');
  }
  const verdict = await verifyWithApi(token);
  if (verdict === 'rejected') {
    return refuse(401, 'Session not accepted');
  }
  if (verdict === 'unavailable') {
    return refuse(502, 'Could not confirm the session');
  }
  const response = NextResponse.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
  response.cookies.set({ name: COOKIE_NAME, value: token, ...cookieOptions(MAX_AGE_SECONDS) });
  return response;
}

/**
 * Clears the staff session cookie (same-origin requests only: another site must not be able to sign a person out).
 */
export async function DELETE(request: Request): Promise<NextResponse> {
  if (!isSameOrigin(request)) {
    return refuse(403, 'Cross-site request refused');
  }
  const response = NextResponse.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
  response.cookies.set({ name: COOKIE_NAME, value: '', ...cookieOptions(0) });
  return response;
}

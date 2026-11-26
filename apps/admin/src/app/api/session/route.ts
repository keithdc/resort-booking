/**
 * @file apps/admin/src/app/api/session/route.ts
 * @shared Clears the staff session cookie (the cookie is only ever SET by the BFF sign-in routes)
 * @dependencies bff-http
 *
 * docs/10 S-11 (done): this route used to accept a token from the browser and store it in the cookie. It no longer does:
 * the token goes from the API to the cookie inside /api/proxy and never passes through page code. What is left is the
 * "forget this browser" call (login page after an ended session, sign-out). Same-origin requests only: another site
 * must not be able to sign a person out.
 */

import { NextResponse } from 'next/server';
import { clearedSessionCookie, isSameOrigin } from '@/shared/server/bff-http';

/**
 * Expires the staff session cookie. Nothing else is accepted: there is no way to set the cookie from here.
 */
export function DELETE(request: Request): NextResponse {
  if (!isSameOrigin(request.headers)) {
    return NextResponse.json({ status: 'error', message: 'Cross-site request refused' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  const response = NextResponse.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
  response.cookies.set(clearedSessionCookie());
  return response;
}

/**
 * @file apps/admin/src/middleware.ts
 * @shared Send unsigned staff to the login page, and set the Content-Security-Policy (per-request nonce)
 * @dependencies @resort-booking/ui/security, public-paths
 */

import { buildCsp, cspHeaderName, generateNonce, originOf, parseOriginList } from '@resort-booking/ui/security';
import { NextResponse, type NextRequest } from 'next/server';
import { isPublicPath } from '@/shared/utils/public-paths';

/**
 * Login, register and invitation pages are public. Everything else in admin needs a session cookie. Every response carries the CSP;
 * the same policy (with the nonce) goes on the request so Next puts the nonce on its own scripts.
 * `CSP_REPORT_ONLY=true` reports violations without blocking.
 */
export function middleware(request: NextRequest): NextResponse {
  const nonce = generateNonce();
  const headerName = cspHeaderName(process.env.CSP_REPORT_ONLY === 'true');
  const policy = buildCsp({
    nonce,
    isDevelopment: process.env.NODE_ENV !== 'production',
    apiOrigin: originOf(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002'),
    extraConnectOrigins: [
      ...parseOriginList(process.env.CSP_EXTRA_CONNECT_ORIGINS),
      originOf(process.env.NEXT_PUBLIC_MAP_STYLE_URL),
    ],
  });

  const path = request.nextUrl.pathname;
  const isPublic = isPublicPath(path);
  if (!isPublic && request.cookies.get('staff_token') === undefined) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', path);
    const redirect = NextResponse.redirect(login);
    redirect.headers.set(headerName, policy);
    return redirect;
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set(headerName, policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(headerName, policy);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|maplibre/).*)'],
};

/**
 * @file apps/web/src/middleware.ts
 * @shared Content-Security-Policy with a per-request nonce
 * @dependencies @resort-booking/ui/security
 */

import { buildCsp, cspHeaderName, generateNonce, originOf, parseOriginList } from '@resort-booking/ui/security';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Sets the CSP on the response and hands the same policy (with the nonce) to Next on the request, so Next puts
 * the nonce on its own scripts. `CSP_REPORT_ONLY=true` reports violations without blocking.
 * `CSP_EXTRA_CONNECT_ORIGINS` adds hosts for a self-hosted map style or tile server.
 */
export function middleware(request: NextRequest): NextResponse {
  const nonce = generateNonce();
  const reportOnly = process.env.CSP_REPORT_ONLY === 'true';
  const policy = buildCsp({
    nonce,
    // Only an explicit `next dev` run relaxes the policy; any other value keeps the strict one.
    isDevelopment: process.env.NODE_ENV === 'development',
    apiOrigin: originOf(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3002'),
    extraConnectOrigins: [
      ...parseOriginList(process.env.CSP_EXTRA_CONNECT_ORIGINS),
      originOf(process.env.NEXT_PUBLIC_MAP_STYLE_URL),
    ],
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set(cspHeaderName(reportOnly), policy);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(cspHeaderName(reportOnly), policy);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|maplibre/).*)'],
};

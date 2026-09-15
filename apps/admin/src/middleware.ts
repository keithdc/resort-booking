/**
 * @file apps/admin/src/middleware.ts
 * @shared Send unsigned staff to the login page
 */

import { NextResponse, type NextRequest } from 'next/server';

/**
 * Login is public. Everything else in admin needs a session cookie.
 */
export function middleware(request: NextRequest): NextResponse {
  const path = request.nextUrl.pathname;
  if (path.startsWith('/login') || path.startsWith('/api/session')) {
    return NextResponse.next();
  }
  if (request.cookies.get('staff_token') === undefined) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', path);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

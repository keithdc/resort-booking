/**
 * @file apps/admin/src/app/api/session/route.ts
 * @shared Stores the staff session cookie for server components
 */

import { NextResponse } from 'next/server';

interface SessionBody {
  token?: unknown;
}

/**
 * Sets the httpOnly cookie the middleware and RSC reads use.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const payload: unknown = await request.json();
  const token =
    typeof payload === 'object' && payload !== null && 'token' in payload
      ? (payload as SessionBody).token
      : undefined;
  if (typeof token !== 'string' || token === '') {
    return NextResponse.json({ status: 'error', message: 'Missing token' }, { status: 400 });
  }
  const response = NextResponse.json({ status: 'ok' });
  response.cookies.set({
    name: 'staff_token',
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}

/**
 * Clears the staff session cookie.
 */
export async function DELETE(): Promise<NextResponse> {
  const response = NextResponse.json({ status: 'ok' });
  response.cookies.set({
    name: 'staff_token',
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}

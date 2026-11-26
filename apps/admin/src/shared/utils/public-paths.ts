/**
 * @file apps/admin/src/shared/utils/public-paths.ts
 * @shared Which admin routes work without a session, and which render without the staff sidebar
 * @dependencies none
 */

/** Routes a signed-out visitor may open: sign in, create a workspace, accept an invitation, the session cookie route, and the BFF proxy (which answers 401 JSON itself: a redirect to an HTML login page would be no use to a fetch). */
const PUBLIC_PREFIXES: readonly string[] = ['/login', '/register', '/invite', '/api/session', '/api/proxy'];

/** Routes shown on their own (no sidebar, no idle timer): the same pages minus the session route. */
const BARE_PREFIXES: readonly string[] = ['/login', '/register', '/invite'];

function matches(prefix: string, path: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/**
 * True when the path needs no session. Matches whole segments: "/invite/abc" yes, "/invitees" no.
 */
export function isPublicPath(path: string): boolean {
  return PUBLIC_PREFIXES.some((prefix: string): boolean => matches(prefix, path));
}

/**
 * True for the pages that replace the whole screen (sign in, register, invitation).
 */
export function isBarePath(path: string): boolean {
  return BARE_PREFIXES.some((prefix: string): boolean => matches(prefix, path));
}

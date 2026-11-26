/**
 * @file apps/admin/src/shared/utils/safe-redirect.ts
 * @shared Only same-site relative paths may be used as a post-login redirect
 * @dependencies none
 */

const MAX_LENGTH = 2000;

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) {
      return true;
    }
  }
  return false;
}

/**
 * The `next` value from the login URL, or '/' when it could send the user to another site.
 * Accepts a path that starts with a single "/" ("/reports?tab=bookings"). Rejects "//host" and "/\host" (browsers
 * read both as another origin), absolute URLs ("https://x", "javascript:..."), control characters (browsers strip
 * tabs and newlines when parsing, so "/\t/evil.example" would become "//evil.example") and any ":" or backslash
 * before the first "?" or "#".
 */
export function safeRedirectTarget(next: string | null | undefined): string {
  if (next === null || next === undefined || next === '' || next.length > MAX_LENGTH) {
    return '/';
  }
  if (!next.startsWith('/') || next.startsWith('//') || hasControlCharacter(next)) {
    return '/';
  }
  const pathEnd = next.search(/[?#]/);
  const path = pathEnd === -1 ? next : next.slice(0, pathEnd);
  if (path.includes('\\') || path.includes(':')) {
    return '/';
  }
  return next;
}

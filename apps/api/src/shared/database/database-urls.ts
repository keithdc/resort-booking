/**
 * @file apps/api/src/shared/database/database-urls.ts
 * @shared Small helpers on connection URLs (never log a URL: it carries a password)
 * @dependencies none
 */

/**
 * The same server and database with other credentials (and optionally another database): how a role's own URL is
 * derived from the admin URL.
 */
export function urlWithCredentials(url: string, user: string, password: string, database?: string): string {
  const parsed = new URL(url);
  parsed.username = user;
  parsed.password = password;
  if (database !== undefined) {
    parsed.pathname = `/${database}`;
  }
  return parsed.toString();
}

/**
 * The database name in a connection URL, or null when there is none.
 */
export function databaseNameOf(url: string): string | null {
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  return name === '' ? null : name;
}

/**
 * A URL safe to print: user, host, port and database, with the password removed.
 */
export function describeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.username}@${parsed.host}${parsed.pathname}`;
  } catch {
    return '(not a valid URL)';
  }
}

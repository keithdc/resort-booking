/**
 * @file apps/web/src/shared/seo/site-url.ts
 * @shared The public address of the guest site, for canonical links, the sitemap and structured data
 * @dependencies none
 */

/** The brand shown in page titles and social cards. */
export const SITE_NAME = 'Humphreys';

/**
 * Reads the public site address from `SITE_URL` (read when the server starts) or `NEXT_PUBLIC_SITE_URL` (fixed at
 * build time). Only an http(s) origin is accepted; a path, query or trailing slash is dropped. Next to `next dev`
 * it falls back to localhost so links work while building; in production a missing value gives null, so the site
 * never advertises localhost addresses to search engines.
 */
export function siteUrl(): string | null {
  const configured = (process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? '').trim();
  if (configured !== '') {
    try {
      const parsed = new URL(configured);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
        return parsed.origin;
      }
    } catch {
      // A malformed value counts as not set.
    }
    return null;
  }
  return process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : null;
}

/**
 * An absolute address for a site path ("/properties/x"), or null when the site address is not configured.
 */
export function absoluteUrl(path: string): string | null {
  const base = siteUrl();
  if (base === null) {
    return null;
  }
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/** The path of a property page. The slug is encoded so odd characters never break the address. */
export function propertyPath(propertySlug: string): string {
  return `/properties/${encodeURIComponent(propertySlug)}`;
}

/** The path of a stay page. */
export function stayPath(propertySlug: string, staySlug: string): string {
  return `${propertyPath(propertySlug)}/stays/${encodeURIComponent(staySlug)}`;
}

/**
 * @file apps/web/src/shared/seo/robots-rules.ts
 * @shared What search engines may crawl on the guest site
 * @dependencies none
 */

/** Never crawled: booking look-up (private), search results (endless date combinations), and links that carry a date search. */
export const DISALLOWED_PATHS: readonly string[] = ['/manage', '/search', '/*checkIn='];

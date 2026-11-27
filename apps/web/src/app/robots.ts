/**
 * @file apps/web/src/app/robots.ts
 * @shared robots.txt
 * @dependencies robots-rules, site-url
 */

import type { MetadataRoute } from 'next';
import { DISALLOWED_PATHS } from '@/shared/seo/robots-rules';
import { absoluteUrl } from '@/shared/seo/site-url';

// Read per request: the site address can be set when the server starts.
export const dynamic = 'force-dynamic';

/**
 * Lets crawlers in, keeps them out of private and endless pages, and points to the sitemap when the site address is set.
 */
export default function robots(): MetadataRoute.Robots {
  const sitemap = absoluteUrl('/sitemap.xml');
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: [...DISALLOWED_PATHS] }],
    ...(sitemap === null ? {} : { sitemap }),
  };
}

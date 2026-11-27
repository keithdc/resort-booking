/**
 * @file apps/web/src/app/sitemap.ts
 * @shared sitemap.xml
 * @dependencies sitemap-entries, property-api
 */

import type { MetadataRoute } from 'next';
import { fetchHouses, fetchProperties } from '@/features/property/services/property-api';
import { buildSitemapEntries } from '@/shared/seo/sitemap-entries';

// Built per request so new stays appear without a rebuild, and so the build never needs the API.
export const dynamic = 'force-dynamic';

/**
 * Lists the home page, the properties and the published stays.
 */
export default function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSitemapEntries({ listProperties: fetchProperties, listStays: fetchHouses });
}

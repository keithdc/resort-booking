/**
 * @file apps/web/src/shared/seo/sitemap-entries.ts
 * @shared The pages listed in sitemap.xml
 * @dependencies site-url
 */

import type { HouseSummary, PropertySummary } from '@resort-booking/shared-types';
import type { MetadataRoute } from 'next';
import { absoluteUrl, propertyPath, stayPath } from './site-url';

/** Where the sitemap gets its pages. Both calls return only what the API publishes. */
export interface SitemapSource {
  listProperties: () => Promise<PropertySummary[]>;
  listStays: (propertySlug: string) => Promise<HouseSummary[]>;
}

/**
 * The home page, the property list, each published property and each published stay. Nothing private is listed:
 * unpublished items are skipped even if a source returned them, and a failing source gives a shorter sitemap,
 * never an error. Without a configured site address the sitemap is empty (it needs absolute addresses).
 */
export async function buildSitemapEntries(source: SitemapSource): Promise<MetadataRoute.Sitemap> {
  const home = absoluteUrl('/');
  const list = absoluteUrl('/properties');
  if (home === null || list === null) {
    return [];
  }
  const entries: MetadataRoute.Sitemap = [
    { url: home, changeFrequency: 'weekly', priority: 1 },
    { url: list, changeFrequency: 'weekly', priority: 0.8 },
  ];
  let properties: PropertySummary[];
  try {
    properties = await source.listProperties();
  } catch {
    return entries;
  }
  const published = properties.filter((property): boolean => property.published);
  const stays = await Promise.all(
    published.map(async (property): Promise<HouseSummary[]> => {
      try {
        return await source.listStays(property.slug);
      } catch {
        return [];
      }
    }),
  );
  for (const [index, property] of published.entries()) {
    const propertyUrl = absoluteUrl(propertyPath(property.slug));
    if (propertyUrl !== null) {
      entries.push({ url: propertyUrl, changeFrequency: 'weekly', priority: 0.9 });
    }
    for (const house of stays[index] ?? []) {
      const stayUrl = house.published && house.propertySlug === property.slug ? absoluteUrl(stayPath(property.slug, house.slug)) : null;
      if (stayUrl !== null) {
        entries.push({ url: stayUrl, changeFrequency: 'weekly', priority: 0.8 });
      }
    }
  }
  return entries;
}

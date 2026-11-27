/**
 * @file apps/web/src/app/properties/page.tsx
 * @feature property
 * @dependencies PropertiesPage
 */

import type { Metadata } from 'next';
import { PropertiesPage } from '@/features/property';
import { fetchProperties } from '@/features/property/services/property-api';
import { propertiesMetadata } from '@/shared/seo/metadata';

export const dynamic = 'force-dynamic';

/** Title, description, canonical link and card for the property list. */
export async function generateMetadata(): Promise<Metadata> {
  try {
    return propertiesMetadata(await fetchProperties());
  } catch {
    return propertiesMetadata([]);
  }
}

/**
 * Properties route (the list of every published property).
 */
export default function PropertiesRoute(): Promise<React.JSX.Element> {
  return PropertiesPage();
}

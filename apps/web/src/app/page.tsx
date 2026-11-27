/**
 * @file apps/web/src/app/page.tsx
 * @feature property
 * @dependencies PropertyHomePage
 */

import type { Metadata } from 'next';
import { PropertyHomePage } from '@/features/property';
import { fetchProperties } from '@/features/property/services/property-api';
import { homeMetadata } from '@/shared/seo/metadata';

export const dynamic = 'force-dynamic';

/** Title, description, canonical link and card for the home page. */
export async function generateMetadata(): Promise<Metadata> {
  try {
    return homeMetadata(await fetchProperties());
  } catch {
    return homeMetadata([]);
  }
}

/**
 * Guest home route.
 */
export default async function Home(): Promise<React.JSX.Element> {
  return <PropertyHomePage />;
}

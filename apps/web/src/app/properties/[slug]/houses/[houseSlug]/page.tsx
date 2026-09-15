/**
 * @file apps/web/src/app/properties/[slug]/houses/[houseSlug]/page.tsx
 * @feature houses
 * @dependencies HouseDetailPage
 */

import { HouseDetailPage } from '@/features/houses';

export const dynamic = 'force-dynamic';

interface HousePageProps {
  params: Promise<{ slug: string; houseSlug: string }>;
}

/**
 * House route.
 */
export default async function HouseRoute({ params }: HousePageProps): Promise<React.JSX.Element> {
  const { slug, houseSlug } = await params;
  return <HouseDetailPage propertySlug={slug} houseSlug={houseSlug} />;
}

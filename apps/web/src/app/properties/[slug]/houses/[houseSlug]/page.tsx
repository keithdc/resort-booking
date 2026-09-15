/**
 * @file apps/web/src/app/properties/[slug]/houses/[houseSlug]/page.tsx
 * @feature houses
 * @dependencies HouseDetailPage
 */

import { HouseDetailPage } from '@/features/houses';
import { stayQueryFromRecord, withDefaultStay } from '@/shared/utils/stay-query';

export const dynamic = 'force-dynamic';

interface HousePageProps {
  params: Promise<{ slug: string; houseSlug: string }>;
  searchParams: Promise<{
    checkIn?: string;
    checkOut?: string;
    nights?: string;
    guestCount?: string;
  }>;
}

/**
 * House route.
 */
export default async function HouseRoute({ params, searchParams }: HousePageProps): Promise<React.JSX.Element> {
  const { slug, houseSlug } = await params;
  const query = await searchParams;
  return (
    <HouseDetailPage
      propertySlug={slug}
      houseSlug={houseSlug}
      stay={withDefaultStay(stayQueryFromRecord(query))}
    />
  );
}

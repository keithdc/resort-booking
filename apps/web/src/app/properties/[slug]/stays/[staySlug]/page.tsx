/**
 * @file apps/web/src/app/properties/[slug]/stays/[staySlug]/page.tsx
 * @feature houses
 * @dependencies HouseDetailPage
 */

import { HouseDetailPage } from '@/features/houses';
import { stayQueryFromRecord, withDefaultStay } from '@/shared/utils/stay-query';

export const dynamic = 'force-dynamic';

interface HousePageProps {
  params: Promise<{ slug: string; staySlug: string }>;
  searchParams: Promise<{
    checkIn?: string;
    checkOut?: string;
    nights?: string;
    guestCount?: string;
  }>;
}

/**
 * Stay route (`/properties/:slug/stays/:staySlug`; the old `/houses/` path redirects here).
 */
export default async function HouseRoute({ params, searchParams }: HousePageProps): Promise<React.JSX.Element> {
  const { slug, staySlug } = await params;
  const query = await searchParams;
  return (
    <HouseDetailPage
      propertySlug={slug}
      houseSlug={staySlug}
      stay={withDefaultStay(stayQueryFromRecord(query))}
    />
  );
}

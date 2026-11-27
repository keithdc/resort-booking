/**
 * @file apps/web/src/app/properties/[slug]/stays/[staySlug]/page.tsx
 * @feature houses
 * @dependencies HouseDetailPage
 */

import type { Metadata } from 'next';
import { HouseDetailPage } from '@/features/houses';
import { fetchHouse } from '@/features/property/services/property-api';
import { stayMetadata } from '@/shared/seo/metadata';
import { orNotFound } from '@/shared/services/or-not-found';
import { parsePromoParam } from '@/shared/utils/offers';
import { stayQueryFromRecord, withDefaultStay } from '@/shared/utils/stay-query';

export const dynamic = 'force-dynamic';

interface HousePageProps {
  params: Promise<{ slug: string; staySlug: string }>;
  searchParams: Promise<{
    checkIn?: string;
    checkOut?: string;
    nights?: string;
    guestCount?: string;
    promo?: string | string[];
  }>;
}

/**
 * Title, description, canonical link (always the clean stay address, whatever dates or promo are in the query)
 * and card. An unknown or unpublished stay is a real 404.
 */
export async function generateMetadata({ params }: Pick<HousePageProps, 'params'>): Promise<Metadata> {
  const { slug, staySlug } = await params;
  return stayMetadata(await orNotFound(fetchHouse(slug, staySlug)));
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
      promoCode={parsePromoParam(query.promo)}
    />
  );
}

/**
 * @file apps/web/src/app/properties/[slug]/page.tsx
 * @feature property
 * @dependencies PropertyDetailPage
 */

import type { HouseSummary } from '@resort-booking/shared-types';
import type { Metadata } from 'next';
import { PropertyDetailPage } from '@/features/property';
import { fetchHouses, fetchProperty } from '@/features/property/services/property-api';
import type { RawSearchParams } from '@/features/property/utils/property-stay-search';
import { orNotFound } from '@/shared/services/or-not-found';
import { propertyMetadata } from '@/shared/seo/metadata';

export const dynamic = 'force-dynamic';

interface PropertyPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}

/**
 * Title, description, canonical link (always the clean address, whatever dates are in the query) and card.
 * An unknown or unpublished property is a real 404.
 */
export async function generateMetadata({ params }: Pick<PropertyPageProps, 'params'>): Promise<Metadata> {
  const { slug } = await params;
  const property = await orNotFound(fetchProperty(slug));
  // A failed stay list only costs the price line in the description.
  const houses = await fetchHouses(slug).catch((): HouseSummary[] => []);
  return propertyMetadata(property, houses);
}

/**
 * Property route. The query string (checkIn, checkOut, nights, guestCount) searches this property in place.
 */
export default async function PropertyRoute({ params, searchParams }: PropertyPageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  return <PropertyDetailPage slug={slug} searchParams={await searchParams} />;
}

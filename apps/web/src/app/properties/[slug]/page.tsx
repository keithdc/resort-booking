/**
 * @file apps/web/src/app/properties/[slug]/page.tsx
 * @feature property
 * @dependencies PropertyDetailPage
 */

import { PropertyDetailPage } from '@/features/property';
import type { RawSearchParams } from '@/features/property/utils/property-stay-search';

export const dynamic = 'force-dynamic';

interface PropertyPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}

/**
 * Property route. The query string (checkIn, checkOut, nights, guestCount) searches this property in place.
 */
export default async function PropertyRoute({ params, searchParams }: PropertyPageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  return <PropertyDetailPage slug={slug} searchParams={await searchParams} />;
}

/**
 * @file apps/web/src/app/search/page.tsx
 * @feature houses
 * @dependencies SearchResultsPage
 */

import type { Metadata } from 'next';
import { SearchResultsPage } from '@/features/houses/components/search-results-page';
import { searchMetadata } from '@/shared/seo/metadata';
import { stayQueryFromRecord, withDefaultStay } from '@/shared/utils/stay-query';

export const dynamic = 'force-dynamic';

interface SearchPageProps {
  searchParams: Promise<{
    checkIn?: string;
    checkOut?: string;
    nights?: string;
    guestCount?: string;
    property?: string;
  }>;
}

/** Search results are never indexed: every date combination is its own page. */
export function generateMetadata(): Metadata {
  return searchMetadata();
}

/**
 * Guest stay search route.
 */
export default async function SearchRoute({ searchParams }: SearchPageProps): Promise<React.JSX.Element> {
  const params = await searchParams;
  return <SearchResultsPage stay={withDefaultStay(stayQueryFromRecord(params))} />;
}

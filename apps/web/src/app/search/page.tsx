/**
 * @file apps/web/src/app/search/page.tsx
 * @feature houses
 * @dependencies SearchResultsPage
 */

import { SearchResultsPage } from '@/features/houses/components/search-results-page';
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

/**
 * Guest stay search route.
 */
export default async function SearchRoute({ searchParams }: SearchPageProps): Promise<React.JSX.Element> {
  const params = await searchParams;
  return <SearchResultsPage stay={withDefaultStay(stayQueryFromRecord(params))} />;
}

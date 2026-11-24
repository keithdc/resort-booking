/**
 * @file apps/web/src/features/houses/components/search-results-page.tsx
 * @feature houses
 * @dependencies inventory search API
 */

import { Box, Container, Typography } from '@mui/material';
import { StaySearchBar } from '@/features/property/components/stay-search-bar';
import { fetchStaySearch } from '../services/inventory-api';
import type { StayQuery } from '@/shared/utils/stay-query';
import { SearchResultsView } from './search-results-view';

interface SearchResultsPageProps {
  stay: StayQuery;
}

/**
 * Houses the API says are free for the stay.
 */
export async function SearchResultsPage({ stay }: SearchResultsPageProps): Promise<React.JSX.Element> {
  const guestCount = Number.parseInt(stay.guestCount, 10);
  const canSearch =
    stay.checkIn !== '' && stay.checkOut !== '' && Number.isInteger(guestCount) && guestCount >= 1;
  const results = canSearch
    ? await fetchStaySearch(stay.checkIn, stay.checkOut, guestCount, stay.propertySlug)
    : [];

  return (
    <Container maxWidth="xl" sx={{ py: 6 }}>
      <Typography variant="h3" component="h1" gutterBottom>
        Available stays
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {stay.checkIn} · {stay.nights} night{stay.nights === '1' ? '' : 's'} (leave {stay.checkOut}) ·{' '}
        {stay.guestCount} guests. Open a stay to hold and pay.
      </Typography>
      <Box sx={{ mb: 4 }}>
        <StaySearchBar initial={stay} />
      </Box>
      {!canSearch ? (
        <Typography>Enter check-in, check-out, and guests to search.</Typography>
      ) : results.length === 0 ? (
        <Typography>No stays are free for those dates. Try other nights or fewer guests.</Typography>
      ) : (
        <SearchResultsView results={results} stay={stay} />
      )}
    </Container>
  );
}

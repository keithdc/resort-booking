/**
 * @file apps/web/src/features/houses/components/search-results-page.tsx
 * @feature houses
 * @dependencies inventory search API
 */

import { Box, Container, Typography } from '@mui/material';
import { BlurFade } from '@resort-booking/ui';
import { StaySearchBar } from '@/features/property/components/stay-search-bar';
import { fetchStaySearch } from '../services/inventory-api';
import type { StayQuery } from '@/shared/utils/stay-query';
import { HouseListingCard } from './house-listing-card';

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
    <Container sx={{ py: 6 }}>
      <Typography variant="h3" component="h1" gutterBottom>
        Available properties
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        {stay.checkIn} · {stay.nights} night{stay.nights === '1' ? '' : 's'} (leave {stay.checkOut}) ·{' '}
        {stay.guestCount} guests. Open a property to hold and pay.
      </Typography>
      <Box sx={{ mb: 4 }}>
        <StaySearchBar initial={stay} />
      </Box>
      {!canSearch ? (
        <Typography>Enter check-in, check-out, and guests to search.</Typography>
      ) : results.length === 0 ? (
        <Typography>No properties are free for those dates. Try other nights or fewer guests.</Typography>
      ) : (
        <Box
          sx={{
            display: 'grid',
            gap: 2,
            gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: '1fr 1fr 1fr' },
          }}
        >
          {results.map((result, index) => (
            <BlurFade key={result.house.id} delay={index * 0.06}>
            <HouseListingCard
              house={result.house}
              quote={result.quote}
              stay={stay}
            />
            </BlurFade>
          ))}
        </Box>
      )}
    </Container>
  );
}

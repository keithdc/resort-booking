/**
 * @file apps/web/src/features/property/components/property-stay-list.tsx
 * @feature property
 * @dependencies house-listing-card, property-stay-search — shows the API's availability answer
 */

import type { HouseSearchResult, HouseSummary } from '@resort-booking/shared-types';
import { Box, Link as MuiLink, Typography } from '@mui/material';
import { BlurFade } from '@resort-booking/ui';
import NextLink from 'next/link';
import { HouseListingCard } from '@/features/houses/components/house-listing-card';
import type { StayQuery } from '@/shared/utils/stay-query';
import { arrangeStays, describeAvailability, type PropertyStaySearch } from '../utils/property-stay-search';

interface PropertyStayListProps {
  propertySlug: string;
  houses: HouseSummary[];
  search: PropertyStaySearch;
  /** The API's search result for this property, or null when there was no search or it failed. */
  results: HouseSearchResult[] | null;
  /** The stay carried onto each stay link. */
  stay: StayQuery;
}

function summaryText(
  search: PropertyStaySearch,
  results: HouseSearchResult[] | null,
  total: number,
): string {
  if (search.kind === 'invalid') {
    return search.reason === 'past'
      ? 'That check-in date has already passed. Showing every stay at its standard rate.'
      : 'We could not read those dates. Showing every stay at its standard rate.';
  }
  if (search.kind === 'search') {
    if (results === null) {
      return 'We could not check availability just now. Showing every stay at its standard rate.';
    }
    return describeAvailability(results.length, total, search.stay, search.guests);
  }
  return '';
}

/**
 * "Choose a stay": every stay at the property. With searched dates the stays the API found free
 * come first with their price for those dates; the rest stay visible but muted. The summary sits
 * in a polite live region so a screen reader hears the result of a new search.
 */
export function PropertyStayList({
  propertySlug,
  houses,
  search,
  results,
  stay,
}: PropertyStayListProps): React.JSX.Element {
  const entries = arrangeStays(houses, results);
  const summary = summaryText(search, results, houses.length);
  return (
    <Box id="stays" sx={{ scrollMarginTop: 96 }}>
      <Typography variant="h4" component="h2" gutterBottom sx={{ mt: 2 }}>
        Choose a stay
      </Typography>
      {houses.length === 0 ? (
        <Typography>No published stays here yet.</Typography>
      ) : (
        <>
          <Box sx={{ mb: 3 }}>
            <Typography aria-live="polite" role="status" color="text.secondary">
              {summary === '' ? 'Open a stay to reserve and pay. Add dates above to see what is free.' : summary}
            </Typography>
            {search.kind !== 'none' ? (
              <MuiLink component={NextLink} href={`/properties/${propertySlug}`}>
                Clear dates
              </MuiLink>
            ) : null}
          </Box>
          <Box
            component="ul"
            sx={{
              display: 'grid',
              gap: 3,
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
              listStyle: 'none',
              m: 0,
              mb: 6,
              p: 0,
            }}
          >
            {entries.map((entry, index) => (
              <BlurFade key={entry.house.id} delay={index * 0.06}>
                <Box component="li">
                  <HouseListingCard
                    house={entry.house}
                    quote={entry.quote}
                    stay={stay}
                    availability={entry.availability}
                  />
                </Box>
              </BlurFade>
            ))}
          </Box>
        </>
      )}
    </Box>
  );
}

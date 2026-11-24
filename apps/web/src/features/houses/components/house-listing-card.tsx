/**
 * @file apps/web/src/features/houses/components/house-listing-card.tsx
 * @feature houses
 * @dependencies MUI
 */

import type { HouseSummary, Quote } from '@resort-booking/shared-types';
import { Box, CardActionArea, CardContent, CardMedia, Typography } from '@mui/material';
import { Highlighter, MagicCard } from '@resort-booking/ui';
import NextLink from 'next/link';
import { formatCents } from '@/shared/utils/money';
import { houseHref, type StayQuery } from '@/shared/utils/stay-query';

interface HouseListingCardProps {
  house: HouseSummary;
  quote: Quote | null;
  stay: StayQuery | null;
}

/**
 * House card: photo, address, capacity, API price. Whole card is the hit target.
 */
export function HouseListingCard({ house, quote, stay }: HouseListingCardProps): React.JSX.Element {
  return (
    <MagicCard>
      <CardActionArea component={NextLink} href={houseHref(house.propertySlug, house.slug, stay)}>
        <Box sx={{ position: 'relative' }}>
          {house.coverPhotoUrl !== null ? (
            <CardMedia
              component="img"
              height="260"
              image={house.coverPhotoUrl}
              alt={house.name}
              sx={{ objectFit: 'cover' }}
            />
          ) : (
            <Box sx={{ height: 160, bgcolor: 'action.hover' }} />
          )}
          <Box
            sx={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: '55%',
              bgcolor: 'common.black',
              opacity: 0.5,
            }}
          />
          <Box sx={{ position: 'absolute', left: 16, right: 16, bottom: 16, color: 'common.white' }}>
            <Typography variant="h6">{house.name}</Typography>
            <Typography variant="body2">{house.propertyCity}</Typography>
          </Box>
        </Box>
        <CardContent>
          <Typography color="text.secondary" sx={{ mt: 1, fontWeight: 600 }}>
            <Highlighter action="highlight" tone="secondary" isView={false}>
              Sleeps {house.capacity}
            </Highlighter>
          </Typography>
          {quote !== null ? (
            <Typography sx={{ mt: 1, color: 'secondary.main', fontWeight: 600 }}>
              {formatCents(quote.totalCents, quote.currencyCode)} for {quote.nights} night
              {quote.nights === 1 ? '' : 's'}
            </Typography>
          ) : (
            <Typography sx={{ mt: 1, fontWeight: 600 }}>
              Standard rate {formatCents(house.nightlyRateCents, house.currencyCode)} / night
            </Typography>
          )}
          <Box sx={{ mt: 1.5, color: 'primary.main', fontWeight: 600 }}>Book this property →</Box>
        </CardContent>
      </CardActionArea>
    </MagicCard>
  );
}

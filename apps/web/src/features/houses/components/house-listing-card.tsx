/**
 * @file apps/web/src/features/houses/components/house-listing-card.tsx
 * @feature houses
 * @dependencies MUI, responsive utils
 */

import type { HouseSummary, PromotedOffer, Quote } from '@resort-booking/shared-types';
import { Box, CardActionArea, CardContent, CardMedia, Typography } from '@mui/material';
import { Highlighter, MagicCard } from '@resort-booking/ui';
import NextLink from 'next/link';
import { OfferChips } from '@/shared/components/offer-chips';
import { formatCents } from '@/shared/utils/money';
import { photoSrcSet } from '@/shared/utils/responsive';
import { houseHref, type StayQuery } from '@/shared/utils/stay-query';
import { ImageScrim } from './image-scrim';

interface HouseListingCardProps {
  house: HouseSummary;
  quote: Quote | null;
  stay: StayQuery | null;
  /**
   * The API's answer for searched dates. "unavailable" mutes the card and says so, but it stays a
   * link so the guest can open the stay and pick other dates. Default "unknown" = no search.
   */
  availability?: 'unknown' | 'available' | 'unavailable';
  /** Offers that apply to this stay, as text chips (no buttons: the whole card is a link). */
  offers?: readonly PromotedOffer[];
}

/**
 * House card: photo, address, capacity, API price. Whole card is the hit target.
 */
export function HouseListingCard({
  house,
  quote,
  stay,
  availability = 'unknown',
  offers = [],
}: HouseListingCardProps): React.JSX.Element {
  const unavailable = availability === 'unavailable';
  return (
    <MagicCard>
      <CardActionArea
        component={NextLink}
        href={houseHref(house.propertySlug, house.slug, stay)}
        aria-disabled={unavailable ? true : undefined}
        data-availability={availability}
      >
        <Box sx={{ position: 'relative', opacity: unavailable ? 0.5 : 1, filter: unavailable ? 'grayscale(0.8)' : 'none' }}>
          {house.coverPhotoUrl !== null ? (
            <CardMedia
              component="img"
              height="260"
              image={house.coverPhotoUrl}
              srcSet={photoSrcSet(house.coverPhotoUrl)}
              sizes="(max-width: 599px) 100vw, (max-width: 899px) 50vw, 600px"
              loading="lazy"
              decoding="async"
              alt={house.name}
              sx={{ objectFit: 'cover' }}
            />
          ) : (
            <Box sx={{ height: 160, bgcolor: 'action.hover' }} />
          )}
          <ImageScrim />
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
          {offers.length > 0 && !unavailable ? (
            <Box sx={{ mt: 1.5 }}>
              <OfferChips offers={offers} />
            </Box>
          ) : null}
          {unavailable ? (
            <Typography sx={{ mt: 1, color: 'text.secondary', fontWeight: 600 }}>
              Not available for these dates and guests
            </Typography>
          ) : null}
          {quote !== null && !unavailable ? (
            <Typography sx={{ mt: 1, color: 'secondary.main', fontWeight: 600 }}>
              {formatCents(quote.totalCents, quote.currencyCode)} for {quote.nights} night
              {quote.nights === 1 ? '' : 's'}
            </Typography>
          ) : (
            <Typography sx={{ mt: 1, fontWeight: 600, color: unavailable ? 'text.secondary' : 'text.primary' }}>
              Standard rate {formatCents(house.nightlyRateCents, house.currencyCode)} / night
            </Typography>
          )}
          <Box sx={{ mt: 1.5, color: 'primary.main', fontWeight: 600 }}>{unavailable ? 'View this stay →' : 'Book this stay →'}</Box>
        </CardContent>
      </CardActionArea>
    </MagicCard>
  );
}

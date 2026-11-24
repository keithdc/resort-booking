/**
 * @file apps/web/src/features/houses/components/listing-highlights.tsx
 * @feature houses
 * @dependencies Magic UI Highlighter, stay-quote-context, nightly-rate-label
 */

'use client';

import { Typography } from '@mui/material';
import { Highlighter } from '@resort-booking/ui';
import { useStayQuote } from '../context/stay-quote-context';
import { nightlyRateParts } from '../utils/nightly-rate-label';

interface ListingHighlightsProps {
  city: string;
  sleeps: number;
  /** The stay's standard rate, shown until the guest's dates have a price. */
  standardRateCents: number;
  currencyCode: string;
}

/**
 * Short header facts with highlighter marks so town, capacity, and rate stand out. The rate follows
 * the dates in the checkout: the seasonal rate (or the range, if the stay crosses seasons), and
 * the standard rate until dates are priced. The first render is always the standard rate.
 */
export function ListingHighlights({ city, sleeps, standardRateCents, currencyCode }: ListingHighlightsProps): React.JSX.Element {
  const quote = useStayQuote();
  const rate = nightlyRateParts(quote, { nightlyRateCents: standardRateCents, currencyCode });
  return (
    <Typography color="text.secondary" sx={{ mb: 3, lineHeight: 2 }}>
      Stay in{' '}
      <Highlighter action="underline" tone="secondary" isView={false}>
        {city}
      </Highlighter>
      {' · '}
      <Highlighter action="highlight" tone="secondary" isView={false}>
        Sleeps {sleeps} guests
      </Highlighter>
      {rate.lead === '' ? ' · ' : ` · ${rate.lead} `}
      <Highlighter action="highlight" tone="secondary" isView={false}>
        {rate.rate}
      </Highlighter>
      {rate.season === null ? null : ` · ${rate.season}`}
    </Typography>
  );
}

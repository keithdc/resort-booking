/**
 * @file apps/web/src/features/houses/components/listing-highlights.tsx
 * @feature houses
 * @dependencies Magic UI Highlighter
 */

'use client';

import { Typography } from '@mui/material';
import { Highlighter } from '@resort-booking/ui';

interface ListingHighlightsProps {
  city: string;
  sleeps: number;
  rateLabel: string;
}

/**
 * Short header facts with highlighter marks so town, capacity, and rate stand out.
 */
export function ListingHighlights({ city, sleeps, rateLabel }: ListingHighlightsProps): React.JSX.Element {
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
      {' · From '}
      <Highlighter action="highlight" tone="secondary" isView={false}>
        {rateLabel} / night
      </Highlighter>
    </Typography>
  );
}

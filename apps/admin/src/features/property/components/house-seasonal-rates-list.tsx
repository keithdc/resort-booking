/**
 * @file apps/admin/src/features/property/components/house-seasonal-rates-list.tsx
 * @feature property
 * @dependencies money, format-date
 */

import type { RatePeriod } from '@resort-booking/shared-types';
import { Box, Typography } from '@mui/material';
import { formatIsoDate } from '@/shared/utils/format-date';
import { formatCents } from '@/shared/utils/money';

interface HouseSeasonalRatesListProps {
  houseName: string;
  periods: readonly RatePeriod[];
  currencyCode: string;
}

/**
 * The seasons on one house as a plain list, so staff can see every rate at a glance.
 */
export function HouseSeasonalRatesList({ houseName, periods, currencyCode }: HouseSeasonalRatesListProps): React.JSX.Element {
  if (periods.length === 0) {
    return (
      <Typography variant="caption" color="text.secondary">
        No seasonal rates: standard rate all year
      </Typography>
    );
  }
  return (
    <Box component="ul" aria-label={`Seasonal rates for ${houseName}`} sx={{ m: 0, mt: 0.5, pl: 2.5, typography: 'caption', color: 'text.secondary' }}>
      {periods.map((period): React.JSX.Element => (
        <li key={period.id}>
          <strong>{period.label}</strong>: {formatIsoDate(period.startDate)} to {formatIsoDate(period.endDate)} ·{' '}
          {formatCents(period.nightlyRateCents, currencyCode)} / night
        </li>
      ))}
    </Box>
  );
}

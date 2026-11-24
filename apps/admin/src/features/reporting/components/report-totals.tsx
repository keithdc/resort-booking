/**
 * @file apps/admin/src/features/reporting/components/report-totals.tsx
 * @feature reporting
 * @dependencies Magic UI NumberTicker
 */

'use client';

import { Chip, Stack } from '@mui/material';
import { NumberTicker } from '@resort-booking/ui';

interface ReportTotalsProps {
  stays: number;
  nights: number;
  revenueLabel: string;
  onStays?: () => void;
  onNights?: () => void;
  onRevenue?: () => void;
}

/**
 * Animated stay/night counts. Revenue string still comes from the API formatter.
 */
export function ReportTotals({
  stays,
  nights,
  revenueLabel,
  onStays,
  onNights,
  onRevenue,
}: ReportTotalsProps): React.JSX.Element {
  return (
    <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 1 }}>
      <Chip
        color="primary"
        clickable={onStays !== undefined}
        onClick={onStays}
        label={
          <span>
            <NumberTicker value={stays} /> bookings
          </span>
        }
      />
      <Chip
        color="success"
        clickable={onNights !== undefined}
        onClick={onNights}
        label={
          <span>
            <NumberTicker value={nights} delay={0.1} /> nights
          </span>
        }
      />
      <Chip color="secondary" clickable={onRevenue !== undefined} onClick={onRevenue} label={revenueLabel} />
    </Stack>
  );
}

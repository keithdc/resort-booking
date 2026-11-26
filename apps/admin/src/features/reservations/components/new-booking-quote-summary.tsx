/**
 * @file apps/admin/src/features/reservations/components/new-booking-quote-summary.tsx
 * @feature reservations
 * @dependencies money, discount-line — renders the API's price, no price math
 */

import type { Quote } from '@resort-booking/shared-types';
import { Alert, Stack, Typography } from '@mui/material';
import { COMBINED_DISCOUNTS_NOTE, discountLineLabel, discountsAreCombined } from '@/shared/utils/discount-line';
import { formatCents } from '@/shared/utils/money';

interface NewBookingQuoteSummaryProps {
  quote: Quote;
}

/**
 * The price of the stay as the guest would be quoted it: nights by rate, discounts, total. When the dates are
 * taken it says so instead.
 */
export function NewBookingQuoteSummary({ quote }: NewBookingQuoteSummaryProps): React.JSX.Element {
  const money = (cents: number): string => formatCents(cents, quote.currencyCode);
  return (
    <Stack spacing={0.5} aria-label="Price of the stay">
      {!quote.available ? <Alert severity="warning">Those dates are not free for this stay. Pick other dates.</Alert> : null}
      {quote.lines.map((line): React.JSX.Element => (
        <Row
          key={`${line.label}-${String(line.nightlyRateCents)}`}
          label={`${String(line.nights)} night${line.nights === 1 ? '' : 's'} × ${money(line.nightlyRateCents)} · ${line.label}`}
          value={money(line.subtotalCents)}
          muted
        />
      ))}
      {quote.discounts.map((discount): React.JSX.Element => (
        <Row key={discount.discountId} label={discountLineLabel(discount)} value={`−${money(discount.amountCents)}`} tone="success.main" />
      ))}
      {discountsAreCombined(quote.discounts) ? (
        <Typography variant="caption" color="text.secondary">
          {COMBINED_DISCOUNTS_NOTE}
        </Typography>
      ) : null}
      <Row label="Total" value={money(quote.totalCents)} strong />
    </Stack>
  );
}

interface RowProps {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
  tone?: string;
}

function Row({ label, value, muted = false, strong = false, tone }: RowProps): React.JSX.Element {
  return (
    <Stack direction="row" justifyContent="space-between" spacing={2}>
      <Typography variant="body2" color={tone ?? (muted ? 'text.secondary' : 'text.primary')} sx={strong ? { fontWeight: 700 } : undefined}>
        {label}
      </Typography>
      <Typography variant="body2" color={tone} sx={strong ? { fontWeight: 700 } : undefined}>
        {value}
      </Typography>
    </Stack>
  );
}

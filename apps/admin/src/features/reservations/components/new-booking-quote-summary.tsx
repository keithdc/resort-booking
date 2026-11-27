/**
 * @file apps/admin/src/features/reservations/components/new-booking-quote-summary.tsx
 * @feature reservations
 * @dependencies money, discount-line — renders the API's price, no price math
 */

import type { StaffBookingQuote } from '@resort-booking/shared-types';
import { Alert, CircularProgress, Skeleton, Stack, Typography } from '@mui/material';
import { COMBINED_DISCOUNTS_NOTE, discountLineLabel, discountsAreCombined } from '@/shared/utils/discount-line';
import { formatCents } from '@/shared/utils/money';

interface NewBookingQuoteSummaryProps {
  /** The price to show, or null before the first one has arrived (placeholder lines are shown). */
  quote: StaffBookingQuote | null;
  /** A new price is being worked out: the shown one is dimmed and the Total shows a loader. */
  loading?: boolean;
}

/**
 * The price of the booking as the guest would be quoted it: nights by rate, discounts, the extras chosen, total. An
 * on-request extra is listed but adds nothing. When the dates are taken it says so instead.
 */
export function NewBookingQuoteSummary({ quote, loading = false }: NewBookingQuoteSummaryProps): React.JSX.Element {
  if (quote === null) {
    return (
      <Stack spacing={0.5} aria-label="Price of the stay" aria-busy="true">
        <Skeleton variant="text" width="70%" />
        <Stack direction="row" justifyContent="space-between" spacing={2} alignItems="center" sx={{ minHeight: 24 }}>
          <Typography variant="body2" sx={{ fontWeight: 700 }}>
            Total
          </Typography>
          <CircularProgress size={16} aria-label="Working out the price" />
        </Stack>
      </Stack>
    );
  }
  const money = (cents: number): string => formatCents(cents, quote.currencyCode);
  return (
    <Stack
      spacing={0.5}
      aria-label="Price of the stay"
      aria-busy={loading}
      sx={{ '& > *:not(:last-child)': { opacity: loading ? 0.5 : 1, transition: 'opacity 150ms' } }}
    >
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
      {quote.extras.map((extra): React.JSX.Element => (
        <Row
          key={extra.extraId}
          label={extra.kind === 'instant' ? `${extra.name} × ${String(extra.quantity)}` : `${extra.name} × ${String(extra.quantity)} · on request`}
          value={extra.kind === 'instant' ? money(extra.lineCents) : 'Not charged now'}
          muted={extra.kind !== 'instant'}
        />
      ))}
      <Row label="Total" value={money(quote.totalCents)} strong loading={loading} />
    </Stack>
  );
}

interface RowProps {
  label: string;
  value: string;
  muted?: boolean;
  strong?: boolean;
  tone?: string;
  /** Show a small loader instead of the value (the price is being worked out). */
  loading?: boolean;
}

function Row({ label, value, muted = false, strong = false, tone, loading = false }: RowProps): React.JSX.Element {
  return (
    <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={2} sx={{ minHeight: 24 }}>
      <Typography variant="body2" color={tone ?? (muted ? 'text.secondary' : 'text.primary')} sx={strong ? { fontWeight: 700 } : undefined}>
        {label}
      </Typography>
      {loading ? (
        <CircularProgress size={16} aria-label="Working out the price" />
      ) : (
        <Typography variant="body2" color={tone} sx={strong ? { fontWeight: 700 } : undefined}>
          {value}
        </Typography>
      )}
    </Stack>
  );
}

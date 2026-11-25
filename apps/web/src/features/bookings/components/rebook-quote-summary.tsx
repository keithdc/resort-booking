/**
 * @file apps/web/src/features/bookings/components/rebook-quote-summary.tsx
 * @feature bookings
 * @dependencies money, rebook-labels — renders the API's quote, no price math
 */

import type { RebookQuote } from '@resort-booking/shared-types';
import { Alert, Stack, Typography } from '@mui/material';
import { COMBINED_DISCOUNTS_NOTE, discountLineLabel, discountsAreCombined } from '@/shared/utils/discount-line';
import { formatCents } from '@/shared/utils/money';
import { balanceKind, balanceStatement } from '../utils/rebook-labels';

interface RebookQuoteSummaryProps {
  quote: RebookQuote;
}

/**
 * What the new dates cost and what it means for the guest: nights by rate, discounts, the change
 * fee, what was already paid, and one clear sentence about paying more or getting money back.
 */
export function RebookQuoteSummary({ quote }: RebookQuoteSummaryProps): React.JSX.Element {
  const money = (cents: number): string => formatCents(cents, quote.currencyCode);
  const kind = balanceKind(quote);
  return (
    <Stack spacing={0.5} aria-label="Price of the new dates">
      <Typography sx={{ fontWeight: 600 }}>
        {quote.newCheckIn} to {quote.newCheckOut} · {quote.nights} night{quote.nights === 1 ? '' : 's'}
      </Typography>
      {quote.problem !== null ? <Alert severity="warning">{quote.problem}</Alert> : null}
      {quote.lines.map((line): React.JSX.Element => (
        <Row key={`${line.label}-${String(line.nightlyRateCents)}`} label={`${String(line.nights)} night${line.nights === 1 ? '' : 's'} × ${money(line.nightlyRateCents)} · ${line.label}`} value={money(line.subtotalCents)} muted />
      ))}
      {quote.discounts.map((discount): React.JSX.Element => (
        <Row key={discount.discountId} label={discountLineLabel(discount)} value={`−${money(discount.amountCents)}`} tone="success.main" />
      ))}
      {discountsAreCombined(quote.discounts) ? (
        <Typography variant="caption" color="text.secondary">
          {COMBINED_DISCOUNTS_NOTE}
        </Typography>
      ) : null}
      <Row label="New total" value={money(quote.newTotalCents)} />
      {quote.feeCents > 0 ? <Row label="Change fee" value={money(quote.feeCents)} /> : null}
      <Row label="Already paid" value={money(quote.paidCents)} muted />
      <Alert severity={kind === 'pay' ? 'info' : kind === 'refund' ? 'success' : 'info'} sx={{ mt: 1 }}>
        {balanceStatement(quote)}
      </Alert>
    </Stack>
  );
}

interface RowProps {
  label: string;
  value: string;
  muted?: boolean;
  tone?: string;
}

function Row({ label, value, muted = false, tone }: RowProps): React.JSX.Element {
  return (
    <Stack direction="row" justifyContent="space-between" spacing={2}>
      <Typography variant="body2" color={tone ?? (muted ? 'text.secondary' : 'text.primary')}>
        {label}
      </Typography>
      <Typography variant="body2" color={tone}>
        {value}
      </Typography>
    </Stack>
  );
}

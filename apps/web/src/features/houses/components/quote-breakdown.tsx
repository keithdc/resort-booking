/**
 * @file apps/web/src/features/houses/components/quote-breakdown.tsx
 * @feature houses
 * @dependencies money — renders API quote lines; no pricing math
 */

import type { Quote } from '@resort-booking/shared-types';
import { Stack, Typography } from '@mui/material';
import { formatCents } from '@/shared/utils/money';

interface QuoteBreakdownProps {
  quote: Quote;
}

/**
 * Price by rate ("2 nights × 180 €, 2 nights × 300 €"), each discount as its own line, then the total. Shows exactly the lines
 * and total the API returned, so a stay that crosses into peak season is never a surprise.
 */
export function QuoteBreakdown({ quote }: QuoteBreakdownProps): React.JSX.Element {
  const seasonal = quote.lines.length > 1 || quote.lines.some((line) => line.label !== 'Standard rate');
  return (
    <Stack spacing={0.5} aria-label="Price breakdown">
      {quote.lines.map((line): React.JSX.Element => (
        <Stack key={`${line.label}-${String(line.nightlyRateCents)}`} direction="row" justifyContent="space-between" spacing={2}>
          <Typography variant="body2" color="text.secondary">
            {line.nights} night{line.nights === 1 ? '' : 's'} × {formatCents(line.nightlyRateCents, quote.currencyCode)}
            {seasonal ? ` · ${line.label}` : ''}
          </Typography>
          <Typography variant="body2">{formatCents(line.subtotalCents, quote.currencyCode)}</Typography>
        </Stack>
      ))}
      {quote.discounts.length > 0 ? (
        <>
          <Stack direction="row" justifyContent="space-between" spacing={2}>
            <Typography variant="body2" color="text.secondary">
              Subtotal
            </Typography>
            <Typography variant="body2">{formatCents(quote.subtotalCents, quote.currencyCode)}</Typography>
          </Stack>
          {quote.discounts.map((discount): React.JSX.Element => (
            <Stack key={discount.discountId} direction="row" justifyContent="space-between" spacing={2}>
              <Typography variant="body2" color="success.main">
                {discount.label}
              </Typography>
              <Typography variant="body2" color="success.main">
                −{formatCents(discount.amountCents, quote.currencyCode)}
              </Typography>
            </Stack>
          ))}
        </>
      ) : null}
      <Stack direction="row" justifyContent="space-between" spacing={2}>
        <Typography sx={{ fontWeight: 600 }}>Total</Typography>
        <Typography sx={{ fontWeight: 600 }}>{formatCents(quote.totalCents, quote.currencyCode)}</Typography>
      </Stack>
    </Stack>
  );
}

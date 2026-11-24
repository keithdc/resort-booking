/**
 * @file apps/web/src/features/bookings/components/cancel-booking-dialog.tsx
 * @feature bookings
 * @dependencies money, cancellation-policy utils — shows the API's refund quote
 */

'use client';

import type { RefundQuote } from '@resort-booking/shared-types';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import { formatCents } from '@/shared/utils/money';

interface CancelBookingDialogProps {
  open: boolean;
  quote: RefundQuote;
  reference: string;
  pending: boolean;
  onKeep: () => void;
  onConfirm: () => void;
}

/**
 * The last step before cancelling: the exact amount coming back, said plainly, with "keep my
 * booking" as the default focus so a stray Enter never cancels.
 */
export function CancelBookingDialog({ open, quote, reference, pending, onKeep, onConfirm }: CancelBookingDialogProps): React.JSX.Element {
  const refund = formatCents(quote.refundCents, quote.currencyCode);
  const noRefund = quote.refundCents === 0;
  return (
    <Dialog open={open} onClose={pending ? undefined : onKeep} fullWidth maxWidth="xs" aria-labelledby="cancel-booking-title">
      <DialogTitle id="cancel-booking-title">Cancel booking {reference}?</DialogTitle>
      <DialogContent>
        <Alert severity={noRefund ? 'error' : 'warning'} sx={{ mb: 2 }}>
          {noRefund
            ? 'You will not get any money back for this cancellation.'
            : `You will get ${refund} back (${String(quote.refundPercent)}% of the ${formatCents(quote.paidCents, quote.currencyCode)} you paid).`}
        </Alert>
        <Typography variant="body2" color="text.secondary">
          Cancelling now, {daysText(quote.daysBeforeCheckIn)} before check-in. Your dates are released straight away and
          this cannot be undone.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button autoFocus onClick={onKeep} disabled={pending}>
          Keep my booking
        </Button>
        <Button color="error" variant="contained" onClick={onConfirm} disabled={pending}>
          {pending ? 'Cancelling…' : noRefund ? 'Cancel without refund' : `Cancel and refund ${refund}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function daysText(days: number): string {
  if (days <= 0) {
    return 'on the day';
  }
  return `${String(days)} day${days === 1 ? '' : 's'}`;
}

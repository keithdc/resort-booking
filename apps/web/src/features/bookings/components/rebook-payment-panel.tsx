/**
 * @file apps/web/src/features/bookings/components/rebook-payment-panel.tsx
 * @feature bookings
 * @dependencies money — amounts come from the API
 */

'use client';

import type { PaymentSummary } from '@resort-booking/shared-types';
import { Alert, Button, Stack } from '@mui/material';
import { formatCents } from '@/shared/utils/money';

interface RebookPaymentPanelProps {
  payment: PaymentSummary;
  working: boolean;
  onPay: () => void;
  onDecline: () => void;
}

/**
 * Paying the balance of a date change. Until a real provider is chosen it is test mode: it says
 * plainly that no money moves and offers pay or a simulated declined card. Nothing changes on the
 * booking until the payment succeeds.
 */
export function RebookPaymentPanel({ payment, working, onPay, onDecline }: RebookPaymentPanelProps): React.JSX.Element {
  const amount = formatCents(payment.amountCents, payment.currencyCode);
  return (
    <Stack spacing={1.5} aria-label="Payment for the date change">
      {payment.simulated ? (
        <Alert severity="info">Test mode: no real money moves. Use the buttons below to simulate the payment.</Alert>
      ) : null}
      <Alert severity="warning">Your dates change only once this payment goes through.</Alert>
      <Button variant="contained" size="large" disabled={working} onClick={onPay}>
        {working ? 'Processing…' : `Pay ${amount}`}
      </Button>
      <Button disabled={working} onClick={onDecline}>
        Simulate a declined card
      </Button>
    </Stack>
  );
}

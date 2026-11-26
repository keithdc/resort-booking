/**
 * @file apps/web/src/features/houses/components/mock-payment-panel.tsx
 * @feature houses
 * @dependencies use-mock-payment, money — amounts come from the API
 */

'use client';

import type { ReservationConfirmation } from '@resort-booking/shared-types';
import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { useEffect } from 'react';
import { formatCents } from '@/shared/utils/money';
import { useMockPayment } from '../hooks/use-mock-payment';

interface MockPaymentPanelProps {
  holdId: string;
  /** The stay is confirmed. */
  onConfirmed: (confirmation: ReservationConfirmation) => void;
  /** The card was declined and the dates were given back; the guest can hold them again. */
  onDeclined: () => void;
}

/**
 * Test-mode payment step shown under a card hold. It says plainly that no real money moves, then
 * lets the guest pay or simulate a declined card. Replaced by the real card form when a payment
 * provider is chosen.
 */
export function MockPaymentPanel({ holdId, onConfirmed, onDeclined }: MockPaymentPanelProps): React.JSX.Element {
  const state = useMockPayment(holdId);
  const { phase, payment, confirmation } = state;

  useEffect((): void => {
    if (phase === 'confirmed' && confirmation !== null) {
      onConfirmed(confirmation);
    }
  }, [phase, confirmation, onConfirmed]);

  if (phase === 'starting') {
    return (
      <Stack direction="row" spacing={1} alignItems="center" aria-label="Preparing payment">
        <CircularProgress size={18} />
        <Typography color="text.secondary">Preparing your payment…</Typography>
      </Stack>
    );
  }

  if (phase === 'declined') {
    return (
      <Alert
        severity="error"
        action={
          <Button color="inherit" size="small" onClick={onDeclined}>
            Try again
          </Button>
        }
      >
        The card was declined and no money was taken. The dates were released.
      </Alert>
    );
  }

  const amount = payment === null ? '' : formatCents(payment.amountCents, payment.currencyCode);
  const busy = phase === 'paying';

  return (
    <Stack spacing={1.5} aria-label="Payment">
      {payment?.simulated === true ? (
        <Alert severity="info">Test mode: no real money moves. Use the buttons below to simulate the payment.</Alert>
      ) : null}
      {state.error !== null ? <Alert severity="error">{state.error}</Alert> : null}
      {payment !== null && phase !== 'error' ? (
        <>
          <Button variant="contained" size="large" fullWidth sx={{ minHeight: 52 }} disabled={busy} onClick={(): void => void state.pay()}>
            {busy ? 'Processing…' : `Pay ${amount}`}
          </Button>
          <Button fullWidth disabled={busy} onClick={(): void => void state.decline()}>
            Simulate a declined card
          </Button>
        </>
      ) : null}
    </Stack>
  );
}

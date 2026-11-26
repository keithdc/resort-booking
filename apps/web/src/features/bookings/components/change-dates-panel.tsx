/**
 * @file apps/web/src/features/bookings/components/change-dates-panel.tsx
 * @feature bookings
 * @dependencies use-change-dates, rebook-quote-summary, rebook-payment-panel
 */

'use client';

import type { GuestBooking, RefundSummary } from '@resort-booking/shared-types';
import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import { StayDateField } from '@/shared/components/stay-date-field';
import { todayIsoDate } from '@/shared/utils/today-iso';
import { useChangeDates } from '../hooks/use-change-dates';
import type { BookingCredentials } from '../hooks/use-manage-booking';
import { confirmLabel } from '../utils/rebook-labels';
import { RebookPaymentPanel } from './rebook-payment-panel';
import { RebookQuoteSummary } from './rebook-quote-summary';

interface ChangeDatesPanelProps {
  booking: GuestBooking;
  credentials: BookingCredentials | null;
  onChanged: (booking: GuestBooking, refund: RefundSummary | null) => void;
  onClose: () => void;
}

/**
 * Change the dates of a booking in two deliberate steps: pick new dates and see the exact price
 * difference, then confirm (paying a balance first if one is owed). The API decides everything.
 */
export function ChangeDatesPanel({ booking, credentials, onChanged, onClose }: ChangeDatesPanelProps): React.JSX.Element {
  const state = useChangeDates({ credentials, booking, onChanged });
  const { quote } = state;

  return (
    <Stack spacing={2} aria-label="Change your dates">
      <Typography variant="h6" component="h3">
        Change your dates
      </Typography>
      {state.error !== null ? <Alert severity="error">{state.error}</Alert> : null}
      {state.phase !== 'pay' ? (
        <>
          <StayDateField
            label="New check-in"
            value={state.checkIn}
            onChange={state.setCheckIn}
            unavailable={state.unavailable}
            todayIso={todayIsoDate()}
          />
          <TextField
            label="Nights"
            type="number"
            value={state.nights}
            onChange={(event): void => state.setNights(event.target.value)}
            slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 1, max: 30, inputMode: 'numeric' } }}
            required
          />
          <Typography variant="body2" color="text.secondary">
            New check-out: {state.checkOut}
          </Typography>
        </>
      ) : null}
      {state.phase === 'choose' ? (
        <Button variant="contained" disabled={state.working || state.unchanged} onClick={(): void => void state.seePrice()}>
          {state.working ? 'Working out the price…' : 'See the price'}
        </Button>
      ) : null}
      {state.phase === 'choose' && state.unchanged ? (
        <Typography variant="body2" color="text.secondary">
          Pick different dates to see what the change would cost.
        </Typography>
      ) : null}
      {state.phase === 'review' && quote !== null ? (
        <>
          <RebookQuoteSummary quote={quote} />
          <Button
            variant="contained"
            disabled={state.working || !quote.available}
            onClick={(): void => void state.confirm()}
          >
            {state.working ? 'Changing…' : confirmLabel(quote)}
          </Button>
          <Button disabled={state.working} onClick={state.back}>
            Pick different dates
          </Button>
        </>
      ) : null}
      {state.phase === 'pay' && state.payment !== null ? (
        <RebookPaymentPanel
          payment={state.payment}
          working={state.working}
          onPay={(): void => void state.pay()}
          onDecline={(): void => void state.decline()}
        />
      ) : null}
      <Button disabled={state.working} onClick={onClose}>
        Keep my current dates
      </Button>
    </Stack>
  );
}

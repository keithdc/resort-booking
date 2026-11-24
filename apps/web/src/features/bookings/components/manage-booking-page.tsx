/**
 * @file apps/web/src/features/bookings/components/manage-booking-page.tsx
 * @feature bookings
 * @dependencies use-manage-booking, cancel-booking-dialog, contact fields
 */

'use client';

import type { GuestBooking, RefundSummary } from '@resort-booking/shared-types';
import { Alert, Box, Button, Chip, Container, Snackbar, Stack, TextField, Typography } from '@mui/material';
import { EmailField, isValidEmail } from '@resort-booking/ui/contact';
import { useState } from 'react';
import { formatCents } from '@/shared/utils/money';
import { useManageBooking } from '../hooks/use-manage-booking';
import { CancelBookingDialog } from './cancel-booking-dialog';

interface ManageBookingPageProps {
  /** Prefills the reference (for example from the confirmation page). The email is never prefilled. */
  initialReference?: string;
}

/**
 * Manage a booking without an account: enter the reference and email you booked with, see the
 * booking and what cancelling would refund, then cancel in two deliberate steps.
 */
export function ManageBookingPage({ initialReference = '' }: ManageBookingPageProps): React.JSX.Element {
  const state = useManageBooking();
  const [reference, setReference] = useState(initialReference);
  const [email, setEmail] = useState('');
  const [confirming, setConfirming] = useState(false);
  const { booking } = state;
  const canSubmit = reference.trim() !== '' && isValidEmail(email) && !state.finding;

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 5, md: 8 } }}>
      <Typography variant="h3" component="h1" gutterBottom>
        Manage your booking
      </Typography>
      {booking === null ? (
        <Stack
          component="form"
          spacing={2}
          onSubmit={(event): void => {
            event.preventDefault();
            if (canSubmit) {
              void state.find(reference, email);
            }
          }}
        >
          <Typography color="text.secondary">
            Enter the booking reference from your confirmation (it looks like BK-1A2B3C4D5E) and the email you booked with.
          </Typography>
          {state.error !== null ? <Alert severity="error">{state.error}</Alert> : null}
          <TextField
            label="Booking reference"
            value={reference}
            required
            onChange={(event): void => setReference(event.target.value)}
            slotProps={{ htmlInput: { autoCapitalize: 'characters', autoComplete: 'off' } }}
          />
          <EmailField label="Email" required value={email} onChange={setEmail} />
          <Button type="submit" variant="contained" size="large" disabled={!canSubmit}>
            {state.finding ? 'Looking…' : 'Find my booking'}
          </Button>
        </Stack>
      ) : (
        <BookingView
          booking={booking}
          error={state.error}
          cancelling={state.cancelling}
          onAskCancel={(): void => setConfirming(true)}
          onAnother={(): void => {
            state.reset();
            setEmail('');
            setReference('');
          }}
        />
      )}
      {booking?.refundQuote != null ? (
        <CancelBookingDialog
          open={confirming}
          quote={booking.refundQuote}
          reference={booking.reference}
          pending={state.cancelling}
          onKeep={(): void => setConfirming(false)}
          onConfirm={(): void => {
            void state.cancel().then((): void => setConfirming(false));
          }}
        />
      ) : null}
      <Snackbar open={state.justCancelled} message="Your booking is cancelled" autoHideDuration={6000} />
    </Container>
  );
}

interface BookingViewProps {
  booking: GuestBooking;
  error: string | null;
  cancelling: boolean;
  onAskCancel: () => void;
  onAnother: () => void;
}

function BookingView({ booking, error, cancelling, onAskCancel, onAnother }: BookingViewProps): React.JSX.Element {
  const cancelled = booking.status === 'cancelled';
  return (
    <Stack spacing={2} aria-label="Your booking">
      {error !== null ? <Alert severity="error">{error}</Alert> : null}
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography variant="h5" component="h2">
          {booking.reference}
        </Typography>
        <Chip size="small" color={cancelled ? 'default' : 'success'} label={cancelled ? 'Cancelled' : 'Confirmed'} />
      </Stack>
      <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 3, rowGap: 0.5 }}>
        <Detail term="Stay" value={`${booking.stayName}, ${booking.propertyName}`} />
        <Detail term="Check-in" value={booking.checkIn} />
        <Detail term="Check-out" value={booking.checkOut} />
        <Detail term="Guests" value={String(booking.guestCount)} />
        <Detail term="Total" value={formatCents(booking.totalCents, booking.currencyCode)} />
      </Box>
      {cancelled && booking.refund !== null ? <RefundNotice refund={booking.refund} reference={booking.reference} /> : null}
      {!cancelled && booking.canCancel && booking.refundQuote !== null ? (
        <>
          <Alert severity="info">
            {booking.refundQuote.refundCents === 0
              ? 'If you cancel now you will not get a refund.'
              : `If you cancel now you get ${formatCents(booking.refundQuote.refundCents, booking.refundQuote.currencyCode)} back (${String(booking.refundQuote.refundPercent)}%).`}
          </Alert>
          <Button color="error" variant="outlined" disabled={cancelling} onClick={onAskCancel}>
            Cancel this booking
          </Button>
        </>
      ) : null}
      {!cancelled && !booking.canCancel ? (
        <Alert severity="warning">{booking.cancelBlockedReason ?? 'This booking can no longer be cancelled online. Please contact the property.'}</Alert>
      ) : null}
      {!cancelled ? (
        <Typography variant="body2" color="text.secondary">
          Need different dates? Contact the property, or cancel and book again.
        </Typography>
      ) : null}
      <Button onClick={onAnother}>Look up another booking</Button>
    </Stack>
  );
}

function Detail({ term, value }: { term: string; value: string }): React.JSX.Element {
  return (
    <>
      <Typography component="dt" color="text.secondary">
        {term}
      </Typography>
      <Typography component="dd" sx={{ m: 0 }}>
        {value}
      </Typography>
    </>
  );
}

function RefundNotice({ refund, reference }: { refund: RefundSummary; reference: string }): React.JSX.Element {
  const amount = formatCents(refund.amountCents, refund.currencyCode);
  if (refund.status === 'failed') {
    return (
      <Alert severity="error">
        Your booking is cancelled, but we could not send your refund of {amount} automatically. Please contact the property
        and quote {reference}.
      </Alert>
    );
  }
  if (refund.amountCents === 0) {
    return <Alert severity="info">Your booking is cancelled. No refund applies to this cancellation.</Alert>;
  }
  return (
    <Alert severity="success">
      Your booking is cancelled. {refund.status === 'pending' ? 'Your refund of' : 'Refunded:'} {amount} ({String(refund.percent)}%)
      {refund.status === 'pending' ? ' is being processed' : ''}.
      {refund.simulated ? ' Test mode: no real money moved.' : ''}
    </Alert>
  );
}

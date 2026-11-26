/**
 * @file apps/web/src/features/bookings/components/manage-booking-page.tsx
 * @feature bookings
 * @dependencies use-manage-booking, cancel-booking-dialog, contact fields
 */

'use client';

import type { BookingExtra, GuestBooking, RefundSummary } from '@resort-booking/shared-types';
import { Alert, Box, Button, Chip, Container, Snackbar, Stack, TextField, Typography } from '@mui/material';
import { EmailField, isValidEmail } from '@resort-booking/ui/contact';
import { useEffect, useRef, useState } from 'react';
import { formatCents } from '@/shared/utils/money';
import { revealElement } from '@/shared/utils/responsive';
import { useManageBooking, type BookingCredentials } from '../hooks/use-manage-booking';
import { CancelBookingDialog } from './cancel-booking-dialog';
import { ChangeDatesPanel } from './change-dates-panel';

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
  // Set after a date change: the old reference, and any refund of the difference.
  const [changeNotice, setChangeNotice] = useState<{ previousReference: string; refund: RefundSummary | null } | null>(null);
  const { booking } = state;
  const canSubmit = reference.trim() !== '' && isValidEmail(email) && !state.finding;
  // A failed lookup shows its message above the form; on a phone the keyboard may have scrolled it away.
  const errorRef = useRef<HTMLDivElement | null>(null);
  const lookupError = booking === null ? state.error : null;
  useEffect((): void => {
    if (lookupError !== null) {
      revealElement(errorRef.current);
    }
  }, [lookupError]);

  return (
    <Container maxWidth="sm" sx={{ py: { xs: 3, md: 8 } }}>
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
          {state.error !== null ? (
            <Alert ref={errorRef} severity="error" role="alert" sx={{ scrollMarginTop: 96 }}>
              {state.error}
            </Alert>
          ) : null}
          <TextField
            label="Booking reference"
            value={reference}
            required
            onChange={(event): void => setReference(event.target.value)}
            slotProps={{
              htmlInput: { autoCapitalize: 'characters', autoComplete: 'off', autoCorrect: 'off', spellCheck: false, enterKeyHint: 'next' },
            }}
          />
          <EmailField label="Email" required value={email} onChange={setEmail} />
          <Button type="submit" variant="contained" size="large" sx={{ minHeight: 52 }} disabled={!canSubmit}>
            {state.finding ? 'Looking…' : 'Find my booking'}
          </Button>
        </Stack>
      ) : (
        <BookingView
          booking={booking}
          credentials={state.credentials}
          changeNotice={changeNotice}
          error={state.error}
          cancelling={state.cancelling}
          onChanged={(changed, refund): void => {
            setChangeNotice({ previousReference: booking.reference, refund });
            state.adopt(changed);
          }}
          onOpenReference={(reference): void => {
            setChangeNotice(null);
            void state.find(reference, email);
          }}
          onAskCancel={(): void => setConfirming(true)}
          onAnother={(): void => {
            setChangeNotice(null);
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
  credentials: BookingCredentials | null;
  changeNotice: { previousReference: string; refund: RefundSummary | null } | null;
  error: string | null;
  cancelling: boolean;
  onAskCancel: () => void;
  onAnother: () => void;
  onChanged: (booking: GuestBooking, refund: RefundSummary | null) => void;
  onOpenReference: (reference: string) => void;
}

function BookingView({
  booking,
  credentials,
  changeNotice,
  error,
  cancelling,
  onAskCancel,
  onAnother,
  onChanged,
  onOpenReference,
}: BookingViewProps): React.JSX.Element {
  const cancelled = booking.status === 'cancelled';
  const [changing, setChanging] = useState(false);
  return (
    <Stack spacing={2} aria-label="Your booking">
      {error !== null ? <Alert severity="error">{error}</Alert> : null}
      {changeNotice !== null ? <ChangedNotice notice={changeNotice} newReference={booking.reference} /> : null}
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography variant="h5" component="h2" sx={{ overflowWrap: 'anywhere' }}>
          {booking.reference}
        </Typography>
        <Chip size="small" color={cancelled ? 'default' : 'success'} label={cancelled ? 'Cancelled' : 'Confirmed'} />
      </Stack>
      <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: 3, rowGap: 0.5 }}>
        <Detail term="Stay" value={`${booking.stayName}, ${booking.propertyName}`} />
        <Detail term="Check-in" value={booking.checkIn} />
        <Detail term="Check-out" value={booking.checkOut} />
        <Detail term="Guests" value={String(booking.guestCount)} />
        {booking.extras.length > 0 ? <Detail term="Extras" value={booking.extras.map(extraText).join('; ')} /> : null}
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
      {cancelled && booking.replacedByReference !== null ? (
        <Alert
          severity="info"
          action={
            <Button color="inherit" size="small" onClick={(): void => onOpenReference(booking.replacedByReference ?? '')}>
              Open the new booking
            </Button>
          }
        >
          The dates of this booking were changed. It was replaced by {booking.replacedByReference}.
        </Alert>
      ) : null}
      {!cancelled && booking.canChangeDates && !changing ? (
        <Button variant="outlined" onClick={(): void => setChanging(true)}>
          Change dates
        </Button>
      ) : null}
      {!cancelled && booking.canChangeDates && changing ? (
        <ChangeDatesPanel
          booking={booking}
          credentials={credentials}
          onChanged={(changed, refund): void => {
            setChanging(false);
            onChanged(changed, refund);
          }}
          onClose={(): void => setChanging(false)}
        />
      ) : null}
      {!cancelled && !booking.canChangeDates && booking.changeDatesBlockedReason !== null ? (
        <Typography variant="body2" color="text.secondary">
          {booking.changeDatesBlockedReason}
        </Typography>
      ) : null}
      <Button onClick={onAnother}>Look up another booking</Button>
    </Stack>
  );
}

/** One extra on the booking: a priced one with what it adds to the total, a request as waiting for the property. */
function extraText(extra: BookingExtra): string {
  const what = `${extra.name} × ${String(extra.quantity)}`;
  if (extra.kind === 'instant') {
    return extra.lineCents > 0 ? `${what} (${formatCents(extra.lineCents, extra.currencyCode)})` : what;
  }
  return extra.status === 'declined' ? `${what} (not available)` : `${what} (requested: the property will confirm, nothing charged yet)`;
}

function Detail({ term, value }: { term: string; value: string }): React.JSX.Element {
  return (
    <>
      <Typography component="dt" color="text.secondary">
        {term}
      </Typography>
      <Typography component="dd" sx={{ m: 0, overflowWrap: 'anywhere' }}>
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

function ChangedNotice({ notice, newReference }: { notice: { previousReference: string; refund: RefundSummary | null }; newReference: string }): React.JSX.Element {
  const refund = notice.refund;
  return (
    <Alert severity="success">
      Your dates are changed. Your new booking reference is {newReference} (the old reference {notice.previousReference} is
      replaced).
      {refund !== null && refund.amountCents > 0
        ? ` ${formatCents(refund.amountCents, refund.currencyCode)} is being refunded to you.`
        : ''}
    </Alert>
  );
}

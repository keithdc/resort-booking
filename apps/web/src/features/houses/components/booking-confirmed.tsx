/**
 * @file apps/web/src/features/houses/components/booking-confirmed.tsx
 * @feature houses
 * @dependencies money — shows what the API confirmed
 */

import type { ReservationConfirmation } from '@resort-booking/shared-types';
import { Alert, Link as MuiLink, Stack, Typography } from '@mui/material';
import NextLink from 'next/link';
import { formatCents } from '@/shared/utils/money';

interface BookingConfirmedProps {
  confirmation: ReservationConfirmation;
  houseName: string;
}

/**
 * What the guest sees once the stay is confirmed: the reference to quote, and the key facts.
 */
export function BookingConfirmed({ confirmation, houseName }: BookingConfirmedProps): React.JSX.Element {
  return (
    <Stack spacing={2} sx={{ p: 2 }} aria-label="Booking confirmed">
      <Alert severity="success">Your booking is confirmed.</Alert>
      <Typography color="text.secondary">Booking reference</Typography>
      <Typography variant="h4" component="p" sx={{ letterSpacing: 1, overflowWrap: 'anywhere' }}>
        {confirmation.reference}
      </Typography>
      <Typography>
        {houseName} · {confirmation.checkIn} to {confirmation.checkOut} · {confirmation.guestCount} guest
        {confirmation.guestCount === 1 ? '' : 's'}
      </Typography>
      <Typography>Total paid: {formatCents(confirmation.totalCents, confirmation.currencyCode)}</Typography>
      <Typography variant="body2" color="text.secondary">
        Keep this reference. You need it, with your email, to manage or cancel your booking.
      </Typography>
      <MuiLink
        component={NextLink}
        href={`/manage?reference=${encodeURIComponent(confirmation.reference)}`}
        sx={{ display: 'inline-flex', alignItems: 'center', minHeight: 44 }}
      >
        Manage or cancel this booking
      </MuiLink>
    </Stack>
  );
}

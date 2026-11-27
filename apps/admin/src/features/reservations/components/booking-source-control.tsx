/**
 * @file apps/admin/src/features/reservations/components/booking-source-control.tsx
 * @feature reservations
 * @dependencies booking-source, staff-reservations-api, use-staff-role
 */

'use client';

import type { BookingSource, StaffReservation } from '@resort-booking/shared-types';
import { Alert, Button, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { useIsAdmin } from '@/shared/hooks/use-staff-role';
import { ApiRequestError } from '@/shared/services/api-client';
import { bookingSourceLabel, correctableSources } from '@/shared/utils/booking-source';
import { changeStaffReservationSource } from '../services/staff-reservations-api';

interface BookingSourceControlProps {
  stay: Pick<StaffReservation, 'id' | 'bookingSource' | 'kind'>;
  onUpdated: (stay: StaffReservation) => void;
}

/**
 * Where the booking came from, and, for an admin, a way to correct it when it was typed wrong. Only inside the same group
 * (the property's own bookings among themselves, or other-site bookings among themselves): the payment of a booking made
 * elsewhere was handled there, so it cannot become one of your own. Employees just read it.
 */
export function BookingSourceControl({ stay, onUpdated }: BookingSourceControlProps): React.JSX.Element {
  const isAdmin = useIsAdmin();
  const options = correctableSources(stay.bookingSource);
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState<BookingSource | ''>('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (): Promise<void> => {
    if (choice === '') {
      return;
    }
    setPending(true);
    setError(null);
    try {
      onUpdated(await changeStaffReservationSource(stay.id, choice));
      setEditing(false);
      setChoice('');
    } catch (failure: unknown) {
      setError(failure instanceof ApiRequestError ? failure.message : 'Could not change the source. Please try again.');
    } finally {
      setPending(false);
    }
  };

  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
        <Typography variant="body2">{bookingSourceLabel(stay.bookingSource)}</Typography>
        {isAdmin && stay.kind === 'reservation' && !editing ? (
          <Button size="small" onClick={(): void => setEditing(true)} aria-label="Change where this booking came from">
            Change
          </Button>
        ) : null}
      </Stack>
      {editing ? (
        <Stack spacing={1}>
          <TextField select size="small" label="Corrected source" value={choice} onChange={(event): void => setChoice(event.target.value as BookingSource)} fullWidth>
            {options.map((source): React.JSX.Element => (
              <MenuItem key={source} value={source}>
                {bookingSourceLabel(source)}
              </MenuItem>
            ))}
          </TextField>
          <Typography variant="caption" color="text.secondary">
            Only to fix a mistake, and only among the same kind of booking: one made on another site stays on another site, because that site holds its payment. It is recorded in the audit log.
          </Typography>
          {error !== null ? <Alert severity="error">{error}</Alert> : null}
          <Stack direction="row" spacing={1}>
            <Button size="small" variant="contained" disabled={choice === '' || pending} onClick={(): void => void save()}>
              {pending ? 'Saving…' : 'Save'}
            </Button>
            <Button
              size="small"
              disabled={pending}
              onClick={(): void => {
                setEditing(false);
                setChoice('');
                setError(null);
              }}
            >
              Cancel
            </Button>
          </Stack>
        </Stack>
      ) : null}
    </Stack>
  );
}

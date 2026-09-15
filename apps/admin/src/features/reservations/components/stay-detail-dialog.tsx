/**
 * @file apps/admin/src/features/reservations/components/stay-detail-dialog.tsx
 * @feature reservations
 * @dependencies staff reservation row from the calendar
 */

'use client';

import type { ArrivalStatus, StaffReservation } from '@resort-booking/shared-types';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Link as MuiLink,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { ApiRequestError } from '@/shared/services/api-client';
import { formatCents } from '@/shared/utils/money';
import { patchStaffReservationArrival } from '../services/staff-reservations-api';

interface StayDetailDialogProps {
  stay: StaffReservation | null;
  onClose: () => void;
  onUpdated: (stay: StaffReservation) => void;
}

/**
 * Full stay card: guest, house, money, and check-in / check-out.
 */
export function StayDetailDialog({ stay, onClose, onUpdated }: StayDetailDialogProps): React.JSX.Element {
  const [pending, setPending] = useState<ArrivalStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect((): void => {
    setError(null);
    setPending(null);
  }, [stay?.id]);

  const setArrival = async (arrivalStatus: ArrivalStatus): Promise<void> => {
    if (stay === null) {
      return;
    }
    setPending(arrivalStatus);
    setError(null);
    try {
      const updated = await patchStaffReservationArrival(stay.id, arrivalStatus);
      onUpdated(updated);
      setSaved(true);
    } catch (err: unknown) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not update arrival');
    } finally {
      setPending(null);
    }
  };

  const canCheckIn =
    stay !== null && stay.kind === 'reservation' && stay.status === 'confirmed' && stay.arrivalStatus === 'expected';
  const canCheckOut =
    stay !== null &&
    stay.kind === 'reservation' &&
    stay.status === 'confirmed' &&
    (stay.arrivalStatus === 'expected' || stay.arrivalStatus === 'checked_in');

  return (
    <>
      <Dialog open={stay !== null} onClose={onClose} fullWidth maxWidth="md">
        {stay !== null ? (
          <>
            <DialogTitle sx={{ pb: 1 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography variant="h5" component="span">
                  {stay.bookerName}
                </Typography>
                <Chip size="small" color={statusColor(stay)} label={statusLabel(stay)} />
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {stay.houseName} at {stay.propertyName}
              </Typography>
            </DialogTitle>
            <DialogContent>
              {error !== null ? (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              ) : null}
              <Box
                sx={{
                  display: 'grid',
                  gap: 2,
                  gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                  pt: 1,
                }}
              >
                <StayBlock title="Stay">
                  <StayFact label="Check-in" value={stay.checkIn} />
                  <StayFact label="Check-out" value={stay.checkOut} />
                  <StayFact label="Arrival" value={arrivalLabel(stay.arrivalStatus)} />
                  <StayFact label="Guests on the booking" value={String(stay.guestCount)} />
                  <StayFact label="House" value={stay.houseName} />
                  <StayFact label="Destination" value={stay.propertyName} />
                </StayBlock>
                <StayBlock title="Guest">
                  <StayFact label="Name" value={stay.bookerName} />
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Email
                    </Typography>
                    <MuiLink href={`mailto:${stay.bookerEmail}`}>{stay.bookerEmail}</MuiLink>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Phone
                    </Typography>
                    <MuiLink href={`tel:${stay.bookerPhone}`}>{stay.bookerPhone}</MuiLink>
                  </Box>
                </StayBlock>
                <StayBlock title="Payment">
                  <StayFact label="Method" value={paymentLabel(stay)} />
                  <StayFact label="Total" value={formatCents(stay.totalCents, stay.currencyCode)} />
                  <StayFact label="Record" value={stay.kind === 'hold' ? 'Hold (not yet a stay)' : 'Reservation'} />
                </StayBlock>
                <StayBlock title="Requests and note">
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Other requests
                    </Typography>
                    {stay.requestNames.length === 0 ? (
                      <Typography color="text.secondary">None ticked</Typography>
                    ) : (
                      <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                        {stay.requestNames.map((name): React.JSX.Element => (
                          <Chip key={name} size="small" label={name} />
                        ))}
                      </Stack>
                    )}
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Note from the guest
                    </Typography>
                    <Typography color={stay.guestNote.trim() === '' ? 'text.secondary' : 'text.primary'}>
                      {stay.guestNote.trim() === '' ? 'No note left at booking' : stay.guestNote}
                    </Typography>
                  </Box>
                </StayBlock>
              </Box>
            </DialogContent>
            <DialogActions>
              {canCheckIn ? (
                <Button
                  variant="contained"
                  disabled={pending !== null}
                  onClick={(): void => {
                    void setArrival('checked_in');
                  }}
                >
                  {pending === 'checked_in' ? 'Checking in…' : 'Check in'}
                </Button>
              ) : null}
              {canCheckOut && stay.arrivalStatus !== 'checked_out' ? (
                <Button
                  variant={canCheckIn ? 'outlined' : 'contained'}
                  disabled={pending !== null}
                  onClick={(): void => {
                    void setArrival('checked_out');
                  }}
                >
                  {pending === 'checked_out' ? 'Checking out…' : 'Check out'}
                </Button>
              ) : null}
              <Button onClick={onClose}>Close</Button>
            </DialogActions>
          </>
        ) : null}
      </Dialog>
      <Snackbar open={saved} autoHideDuration={3000} onClose={(): void => setSaved(false)}>
        <Alert severity="success" onClose={(): void => setSaved(false)}>
          Arrival updated
        </Alert>
      </Snackbar>
    </>
  );
}

interface StayBlockProps {
  title: string;
  children: React.ReactNode;
}

function StayBlock({ title, children }: StayBlockProps): React.JSX.Element {
  return (
    <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper' }}>
      <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
        {title}
      </Typography>
      <Divider sx={{ mb: 1.5 }} />
      <Stack spacing={1.25}>{children}</Stack>
    </Box>
  );
}

interface StayFactProps {
  label: string;
  value: string;
}

function StayFact({ label, value }: StayFactProps): React.JSX.Element {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
      <Typography>{value}</Typography>
    </Box>
  );
}

function paymentLabel(stay: StaffReservation): string {
  if (stay.paymentMethod === 'bank_transfer') {
    return 'Bank transfer';
  }
  if (stay.paymentMethod === 'card') {
    return 'Card / Apple Pay / Google Pay';
  }
  return 'Not recorded';
}

function arrivalLabel(status: ArrivalStatus): string {
  if (status === 'checked_in') {
    return 'In-house';
  }
  if (status === 'checked_out') {
    return 'Checked out';
  }
  return 'Expected';
}

function statusLabel(stay: StaffReservation): string {
  if (stay.rebookOfId !== null) {
    return `Rebook · ${stay.status}`;
  }
  if (stay.status === 'confirmed') {
    return `Confirmed · ${arrivalLabel(stay.arrivalStatus)}`;
  }
  if (stay.status === 'active') {
    return 'Pending payment';
  }
  if (stay.status === 'cancelled') {
    return 'Cancelled';
  }
  if (stay.status === 'released') {
    return 'Released hold';
  }
  if (stay.status === 'expired') {
    return 'Expired hold';
  }
  return stay.status;
}

function statusColor(stay: StaffReservation): 'success' | 'warning' | 'info' | 'error' | 'default' {
  if (stay.rebookOfId !== null && stay.status !== 'cancelled' && stay.status !== 'released') {
    return 'info';
  }
  if (stay.status === 'confirmed' && stay.arrivalStatus === 'checked_out') {
    return 'default';
  }
  if (stay.status === 'confirmed') {
    return 'success';
  }
  if (stay.status === 'active') {
    return 'warning';
  }
  if (stay.status === 'cancelled' || stay.status === 'released' || stay.status === 'expired') {
    return 'error';
  }
  return 'default';
}

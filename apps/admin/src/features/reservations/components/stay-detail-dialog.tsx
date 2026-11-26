/**
 * @file apps/admin/src/features/reservations/components/stay-detail-dialog.tsx
 * @feature reservations
 * @dependencies staff reservation row from the calendar
 */

'use client';

import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ChecklistOutlinedIcon from '@mui/icons-material/ChecklistOutlined';
import CloseIcon from '@mui/icons-material/Close';
import EventNoteOutlinedIcon from '@mui/icons-material/EventNoteOutlined';
import EventRepeatOutlinedIcon from '@mui/icons-material/EventRepeatOutlined';
import LoginOutlinedIcon from '@mui/icons-material/LoginOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
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
  IconButton,
  Link as MuiLink,
  Snackbar,
  Stack,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { StatusChip } from '@/shared/components/status-chip';
import { useCanManageRefunds } from '@/shared/hooks/use-staff-role';
import { UserAvatar } from '@/shared/components/user-avatar';
import { ApiRequestError } from '@/shared/services/api-client';
import { formatIsoDate } from '@/shared/utils/format-date';
import { stayStatusStyle } from '@/shared/utils/status-style';
import { formatDateTime } from '@/shared/utils/booking-labels';
import { formatCents } from '@/shared/utils/money';
import { markStaffReservationPaid, patchStaffReservationArrival } from '../services/staff-reservations-api';
import { nightsBetween, todayLocalIso } from '../utils/dates';
import { bookingExtraText, canMarkPaid, MARK_PAID_NEEDS_ACCESS_MESSAGE, paymentMethodText } from '../utils/payment-status';
import {
  canCancelStay,
  canChangeStayDates,
  cancelNotice,
  changeNotice,
  isSameDayLockedForEmployee,
  SAME_DAY_ADMIN_ONLY_MESSAGE,
} from '../utils/stay-actions';
import { CancellationBlock, HistoryBlock, RefundsBlock } from './booking-records';
import { PaymentStatusChip } from './payment-status-chip';
import { StaffCancelDialog } from './staff-cancel-dialog';
import { StaffChangeDatesDialog } from './staff-change-dates-dialog';
import { StaffNotesBlock } from './staff-notes-block';
import { StayBlock, StayFact } from './stay-block';

/** On a phone each action group takes the full width and its buttons share the row. */
const STACKED_ACTIONS = { width: { xs: '100%', sm: 'auto' }, '& > button': { flex: { xs: '1 1 140px', sm: '0 0 auto' } } } as const;

interface StayDetailDialogProps {
  stay: StaffReservation | null;
  onClose: () => void;
  onUpdated: (stay: StaffReservation) => void;
  /** A cancellation or date change happened: lists and counts elsewhere should reload. */
  onChanged: () => void;
}

/**
/**
 * Full booking card: guest, stay, money, what was cancelled or refunded, date changes, and the
 * actions staff can take (check in or out, cancel for the guest, change dates).
 */
export function StayDetailDialog({ stay, onClose, onUpdated, onChanged }: StayDetailDialogProps): React.JSX.Element {
  const [pending, setPending] = useState<ArrivalStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [changeOpen, setChangeOpen] = useState(false);
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);
  const canManageRefunds = useCanManageRefunds();

  useEffect((): void => {
    setError(null);
    setPending(null);
    setCancelOpen(false);
    setChangeOpen(false);
    setMarkPaidOpen(false);
    setMarkError(null);
  }, [stay?.id]);

  const markPaid = async (): Promise<void> => {
    if (stay === null) {
      return;
    }
    setMarking(true);
    setMarkError(null);
    try {
      const updated = await markStaffReservationPaid(stay.id);
      onUpdated(updated);
      setMarkPaidOpen(false);
      setNotice(`Marked as paid: ${updated.reference}`);
      onChanged();
    } catch (err: unknown) {
      setMarkError(err instanceof ApiRequestError ? err.message : 'Could not mark the booking as paid. Please try again.');
    } finally {
      setMarking(false);
    }
  };

  const setArrival = async (arrivalStatus: ArrivalStatus): Promise<void> => {
    if (stay === null) {
      return;
    }
    setPending(arrivalStatus);
    setError(null);
    try {
      const updated = await patchStaffReservationArrival(stay.id, arrivalStatus);
      onUpdated(updated);
      setNotice('Arrival updated');
    } catch (err: unknown) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not update arrival');
    } finally {
      setPending(null);
    }
  };

  const canCheckIn =
    stay !== null && stay.kind === 'reservation' && stay.status === 'confirmed' && stay.arrivalStatus === 'expected';
  const canCancel = stay !== null && canCancelStay(stay);
  const canTickPaid = stay !== null && canMarkPaid(stay);
  const canChange = stay !== null && canChangeStayDates(stay, todayLocalIso());
  // Only changing dates is locked on the check-in day: a cancellation goes through (with no refund) without refund access.
  const sameDayLocked = stay !== null && canChange && isSameDayLockedForEmployee(stay, canManageRefunds, todayLocalIso());
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
            <DialogTitle sx={{ pb: 1.5, pr: 7, pl: { xs: 2, sm: 3 } }}>
              <Stack direction="row" spacing={{ xs: 1.5, sm: 2 }} alignItems="center">
                <UserAvatar name={stay.bookerName} size={52} />
                <Box sx={{ minWidth: 0 }}>
                  <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                    <Typography variant="h5" component="span" sx={{ fontSize: { xs: '1.25rem', sm: undefined } }}>
                      {stay.bookerName}
                    </Typography>
                    <StatusChip status={stayStatusStyle(stay)} label={statusLabel(stay)} />
                    {stay.kind === 'reservation' && stay.status === 'confirmed' ? <PaymentStatusChip stay={stay} showPaid /> : null}
                    <Chip size="small" variant="outlined" label={stay.reference} />
                  </Stack>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    {stay.houseName} at {stay.propertyName}
                  </Typography>
                </Box>
              </Stack>
              <IconButton aria-label="Close booking" onClick={onClose} sx={{ position: 'absolute', right: 12, top: 12 }}>
                <CloseIcon />
              </IconButton>
            </DialogTitle>
            <DialogContent>
              {error !== null ? (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              ) : null}
              <SummaryStrip stay={stay} />
              <Box
                sx={{
                  display: 'grid',
                  gap: 2,
                  gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: '1fr 1fr' },
                  pt: 2,
                }}
              >
                <StayBlock title="Guest" icon={<PersonOutlineIcon />} tone="primary">
                  <StayFact label="Name" value={stay.bookerName} />
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                      Email
                    </Typography>
                    <MuiLink href={`mailto:${stay.bookerEmail}`} sx={{ overflowWrap: 'anywhere' }}>{stay.bookerEmail}</MuiLink>
                  </Box>
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
                      Phone
                    </Typography>
                    {stay.bookerPhone.trim() === '' ? (
                      <Typography color="text.secondary">Not given</Typography>
                    ) : (
                      <MuiLink href={`tel:${stay.bookerPhone}`}>{stay.bookerPhone}</MuiLink>
                    )}
                  </Box>
                </StayBlock>
                <StayBlock title="Booking" icon={<EventNoteOutlinedIcon />} tone="info">
                  <StayFact label="Check-in" value={stay.checkIn} />
                  <StayFact label="Check-out" value={stay.checkOut} />
                  <StayFact label="Arrival" value={arrivalLabel(stay.arrivalStatus)} />
                  <StayFact label="Guests on the booking" value={String(stay.guestCount)} />
                  <StayFact label="Stay" value={stay.houseName} />
                  <StayFact label="Property" value={stay.propertyName} />
                  {stay.createdByName !== null ? <StayFact label="Booked by" value={`${stay.createdByName} (staff)`} /> : null}
                  <StayFact
                    label="Cancellation terms"
                    value={
                      stay.termsAcceptedAt === null
                        ? stay.createdByName !== null
                          ? 'Booked by staff: the guest did not accept terms online'
                          : 'Not recorded'
                        : `Accepted the cancellation terms on ${formatDateTime(stay.termsAcceptedAt)}`
                    }
                  />
                </StayBlock>
                <StayBlock title="Payment" icon={<PaymentsOutlinedIcon />} tone="success">
                  <StayFact label="Method" value={paymentMethodText(stay.paymentMethod)} />
                  <StayFact label="Status" value={paymentStatusText(stay)} />
                  <StayFact label="Total" value={formatCents(stay.totalCents, stay.currencyCode)} />
                  <StayFact label="Paid so far" value={formatCents(stay.paidCents, stay.currencyCode)} />
                  <StayFact label="Record" value={stay.kind === 'hold' ? 'Hold (not yet a booking)' : 'Reservation'} />
                </StayBlock>
                <StayBlock title="Requests and note" icon={<ChecklistOutlinedIcon />} tone="secondary">
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block">
                      Extras
                    </Typography>
                    {stay.extras.length === 0 ? (
                      <Typography color="text.secondary">None chosen</Typography>
                    ) : (
                      <Stack component="ul" spacing={0.5} sx={{ mt: 0.5, m: 0, p: 0, listStyle: 'none' }} aria-label="Extras on this booking">
                        {stay.extras.map((extra): React.JSX.Element => (
                          <Typography key={extra.id} component="li" variant="body2">
                            {bookingExtraText(extra, (cents: number): string => formatCents(cents, extra.currencyCode))}
                          </Typography>
                        ))}
                      </Stack>
                    )}
                  </Box>
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
                {stay.kind === 'reservation' ? (
                  <StaffNotesBlock
                    bookingId={stay.id}
                    onChanged={(count: number, lastNoteAt: string | null): void => onUpdated({ ...stay, notesCount: count, lastNoteAt })}
                  />
                ) : null}
                {stay.cancellation !== null ? <CancellationBlock cancellation={stay.cancellation} /> : null}
                {stay.kind === 'reservation' ? <RefundsBlock refunds={stay.refunds} /> : null}
                {stay.kind === 'reservation' ? <HistoryBlock stay={stay} /> : null}
              </Box>
            </DialogContent>
            {sameDayLocked ? (
              <Alert severity="info" sx={{ mx: { xs: 2, sm: 3 }, mb: 1 }}>
                {SAME_DAY_ADMIN_ONLY_MESSAGE}
              </Alert>
            ) : null}
            {canTickPaid && !canManageRefunds ? (
              <Alert severity="info" sx={{ mx: { xs: 2, sm: 3 }, mb: 1 }}>
                {MARK_PAID_NEEDS_ACCESS_MESSAGE}
              </Alert>
            ) : null}
            <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 2, justifyContent: 'space-between', flexWrap: 'wrap', gap: 1, borderTop: 1, borderColor: 'divider' }}>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={STACKED_ACTIONS}>
                {canCancel ? (
                  <Button color="error" variant="outlined" startIcon={<CancelOutlinedIcon />} disabled={pending !== null} onClick={(): void => setCancelOpen(true)}>
                    Cancel booking
                  </Button>
                ) : null}
                {canTickPaid ? (
                  <Button variant="contained" color="success" startIcon={<CheckCircleOutlineIcon />} disabled={pending !== null || !canManageRefunds} onClick={(): void => setMarkPaidOpen(true)}>
                    Mark as paid
                  </Button>
                ) : null}
                {canChange ? (
                  <Button variant="outlined" startIcon={<EventRepeatOutlinedIcon />} disabled={pending !== null || sameDayLocked} onClick={(): void => setChangeOpen(true)}>
                    Change dates
                  </Button>
                ) : null}
              </Stack>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={STACKED_ACTIONS}>
                {canCheckIn ? (
                  <Button
                    variant="contained"
                    startIcon={<LoginOutlinedIcon />}
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
                    startIcon={<LogoutOutlinedIcon />}
                    disabled={pending !== null}
                    onClick={(): void => {
                      void setArrival('checked_out');
                    }}
                  >
                    {pending === 'checked_out' ? 'Checking out…' : 'Check out'}
                  </Button>
                ) : null}
                <Button onClick={onClose}>Close</Button>
              </Stack>
            </DialogActions>
          </>
        ) : null}
      </Dialog>
      {stay !== null ? (
        <>
          <StaffCancelDialog
            open={cancelOpen}
            reservationId={stay.id}
            reference={stay.reference}
            canManageRefunds={canManageRefunds}
            onClose={(): void => setCancelOpen(false)}
            onCancelled={(result): void => {
              setCancelOpen(false);
              onUpdated(result.reservation);
              setNotice(cancelNotice(result));
              onChanged();
            }}
          />
          <StaffChangeDatesDialog
            open={changeOpen}
            stay={stay}
            canManageRefunds={canManageRefunds}
            lockedReason={sameDayLocked ? SAME_DAY_ADMIN_ONLY_MESSAGE : null}
            onClose={(): void => setChangeOpen(false)}
            onChanged={(result): void => {
              setChangeOpen(false);
              setNotice(changeNotice(result));
              onChanged();
              onClose();
            }}
          />
        </>
      ) : null}
      <ConfirmDialog
        open={markPaidOpen && stay !== null}
        title={`Mark ${stay?.reference ?? ''} as paid?`}
        confirmLabel="Mark as paid"
        pending={marking}
        error={markError}
        onConfirm={(): void => {
          void markPaid();
        }}
        onClose={(): void => {
          setMarkPaidOpen(false);
          setMarkError(null);
        }}
      >
        Mark {stay?.reference ?? ''} as paid? Use this once the guest has paid you at the hotel. It is recorded in the audit log with your name.
        {stay !== null ? ` The whole total of ${formatCents(stay.totalCents, stay.currencyCode)} will count as paid.` : ''}
      </ConfirmDialog>
      <Snackbar open={notice !== null} autoHideDuration={6000} onClose={(): void => setNotice(null)}>
        <Alert severity="success" onClose={(): void => setNotice(null)}>
          {notice}
        </Alert>
      </Snackbar>
    </>
  );
}

function paymentStatusText(stay: StaffReservation): string {
  if (stay.paymentStatus === 'pending') {
    return 'Not paid yet: pay at hotel';
  }
  if (stay.paidAt !== null) {
    return `Paid at hotel on ${formatDateTime(stay.paidAt)}`;
  }
  return 'Paid';
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

interface SummaryStripProps {
  stay: StaffReservation;
}

/**
 * The four things staff look for first: dates, guests, money and arrival, as big tiles above the details.
 */
function SummaryStrip({ stay }: SummaryStripProps): React.JSX.Element {
  const nights = nightsBetween(stay.checkIn, stay.checkOut);
  const tiles: Array<{ label: string; value: string; note: string }> = [
    {
      label: 'Dates',
      value: `${formatIsoDate(stay.checkIn)} → ${formatIsoDate(stay.checkOut)}`,
      note: `${String(nights)} ${nights === 1 ? 'night' : 'nights'}`,
    },
    { label: 'Guests', value: String(stay.guestCount), note: stay.guestCount === 1 ? 'person' : 'people' },
    {
      label: 'Total',
      value: formatCents(stay.totalCents, stay.currencyCode),
      note: stay.paymentStatus === 'pending' ? 'Not paid yet' : `${formatCents(stay.paidCents, stay.currencyCode)} paid`,
    },
    { label: 'Arrival', value: arrivalLabel(stay.arrivalStatus), note: paymentMethodText(stay.paymentMethod) },
  ];
  return (
    <Box
      component="dl"
      aria-label="Booking summary"
      sx={{ display: 'grid', gap: 1.5, m: 0, gridTemplateColumns: { xs: '1fr 1fr', md: '1.6fr 0.7fr 1fr 1fr' } }}
    >
      {tiles.map((tile): React.JSX.Element => (
        <Box key={tile.label} sx={{ px: 1.75, py: 1.25, borderRadius: 2, bgcolor: 'action.hover', border: 1, borderColor: 'divider' }}>
          <Typography component="dt" variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
            {tile.label}
          </Typography>
          <Typography component="dd" variant="subtitle1" sx={{ m: 0, fontWeight: 700 }}>
            {tile.value}
          </Typography>
          <Typography component="dd" variant="caption" color="text.secondary" sx={{ m: 0 }}>
            {tile.note}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

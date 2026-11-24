/**
 * @file apps/admin/src/features/reservations/components/staff-change-dates-dialog.tsx
 * @feature reservations
 * @dependencies use-staff-change-dates, staff-quote-summary, change-labels
 */

'use client';

import type { StaffChangeResult, StaffReservation } from '@resort-booking/shared-types';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useStaffChangeDates } from '../hooks/use-staff-change-dates';
import { MAX_NOTE_LENGTH } from '../utils/cancel-refund';
import { confirmChangeLabel, outsidePaymentLabel } from '../utils/change-labels';
import { StaffQuoteSummary } from './staff-quote-summary';

interface StaffChangeDatesDialogProps {
  open: boolean;
  stay: Pick<StaffReservation, 'id' | 'reference' | 'checkIn' | 'checkOut'>;
  onClose: () => void;
  onChanged: (result: StaffChangeResult) => void;
}

/**
 * Move a guest to other dates, even when guests cannot change their own. Staff see the exact price
 * difference first; if the guest owes money, staff confirm it was paid outside the system.
 */
export function StaffChangeDatesDialog({ open, stay, onClose, onChanged }: StaffChangeDatesDialogProps): React.JSX.Element {
  const state = useStaffChangeDates({ stay, open, onChanged });
  const { quote } = state;

  return (
    <Dialog open={open} onClose={state.saving ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="staff-change-title">
      <DialogTitle id="staff-change-title">Change the dates of {stay.reference}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <Alert severity="info">
            You can do this even when guests cannot change their own dates. The old booking is cancelled and replaced by a new
            booking with a new reference.
          </Alert>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField
              label="New check-in"
              type="date"
              value={state.checkIn}
              onChange={(event): void => state.setCheckIn(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
              required
            />
            <TextField
              label="Nights"
              type="number"
              value={state.nights}
              onChange={(event): void => state.setNights(event.target.value)}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 1, max: 60 } }}
              fullWidth
              required
            />
          </Stack>
          <Typography variant="body2" color="text.secondary">
            New check-out: {state.checkOut}
          </Typography>
          <FormControlLabel
            control={<Checkbox checked={state.waiveFee} onChange={(event): void => state.setWaiveFee(event.target.checked)} />}
            label="Waive the change fee"
          />
          <Button variant="outlined" disabled={state.quoting || state.saving || state.unchanged} onClick={(): void => void state.seePrice()}>
            {state.quoting ? 'Working out the price…' : 'See price'}
          </Button>
          {state.unchanged ? (
            <Typography variant="body2" color="text.secondary">
              Pick different dates to see what the change would cost.
            </Typography>
          ) : null}
          {quote !== null ? <StaffQuoteSummary quote={quote} /> : null}
          {quote !== null && quote.available && state.needsOutsidePayment ? (
            <FormControlLabel
              control={<Checkbox checked={state.outsidePaid} onChange={(event): void => state.setOutsidePaid(event.target.checked)} />}
              label={outsidePaymentLabel(quote)}
            />
          ) : null}
          {quote !== null && quote.available ? (
            <TextField
              label="Note"
              value={state.note}
              onChange={(event): void => state.setNote(event.target.value)}
              error={state.noteError !== null}
              helperText={
                state.noteError ?? `Kept on the record with your name. ${String(state.note.length)}/${String(MAX_NOTE_LENGTH)}`
              }
              multiline
              minRows={2}
              required
            />
          ) : null}
          {state.error !== null ? <Alert severity="error">{state.error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button autoFocus onClick={onClose} disabled={state.saving}>
          Keep the current dates
        </Button>
        <Button variant="contained" disabled={!state.canConfirm} onClick={(): void => void state.confirm()}>
          {state.saving ? 'Changing…' : quote === null ? 'Change dates' : confirmChangeLabel(quote)}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

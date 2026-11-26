/**
 * @file apps/admin/src/features/reservations/components/staff-cancel-dialog.tsx
 * @feature reservations
 * @dependencies use-staff-cancel, cancel-refund, money
 */

'use client';

import type { StaffCancelResult } from '@resort-booking/shared-types';
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { formatCents } from '@/shared/utils/money';
import { useStaffCancel } from '../hooks/use-staff-cancel';
import { confirmCancelLabel, isCancelReason, MAX_NOTE_LENGTH } from '../utils/cancel-refund';

interface StaffCancelDialogProps {
  open: boolean;
  reservationId: string;
  reference: string;
  /** Only an admin, or an employee with refund access, may choose a reason other than "guest asked" (the API answers 403 otherwise). */
  canManageRefunds: boolean;
  onClose: () => void;
  onCancelled: (result: StaffCancelResult) => void;
}

/**
 * Cancel a booking for a guest. Staff pick why (which decides the refund), write who asked and
 * why, and see the exact consequence on the confirm button. "Keep the booking" has the focus.
 */
export function StaffCancelDialog({ open, reservationId, reference, canManageRefunds, onClose, onCancelled }: StaffCancelDialogProps): React.JSX.Element {
  const state = useStaffCancel({ reservationId, open, onCancelled });
  const { preview } = state;
  const money = (cents: number): string => formatCents(cents, preview?.currencyCode ?? 'EUR');

  return (
    <Dialog open={open} onClose={state.saving ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="staff-cancel-title">
      <DialogTitle id="staff-cancel-title">Cancel booking {reference}?</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {state.loading ? (
            <Stack direction="row" spacing={1} alignItems="center" aria-label="Loading cancellation details">
              <CircularProgress size={18} />
              <Typography color="text.secondary">Checking what has been paid…</Typography>
            </Stack>
          ) : null}
          {state.loadError !== null ? <Alert severity="error">{state.loadError}</Alert> : null}
          {preview !== null && !preview.canCancel ? (
            <Alert severity="warning">{preview.blockedReason ?? 'This booking cannot be cancelled.'}</Alert>
          ) : null}
          {preview !== null && preview.canCancel ? (
            <>
              {preview.notice !== null ? <Alert severity="info">{preview.notice}</Alert> : null}
              <Typography>
                The guest has paid <strong>{money(preview.paidCents)}</strong>. Their dates are released as soon as you confirm.
              </Typography>
              <RadioGroup
                aria-label="Why is the booking being cancelled?"
                value={state.reason}
                onChange={(event): void => {
                  if (isCancelReason(event.target.value)) {
                    state.setReason(event.target.value);
                  }
                }}
              >
                <FormControlLabel
                  value="guest_request"
                  control={<Radio />}
                  label={
                    preview.policyRefund === null
                      ? 'Guest asked: this booking has no refund ladder, so no refund'
                      : preview.notice !== null
                        ? 'Guest asked: no refund (check-in is today)'
                        : `Guest asked: policy refund ${money(preview.policyRefund.refundCents)} (${String(preview.policyRefund.refundPercent)}%)`
                  }
                />
                {canManageRefunds ? (
                  <FormControlLabel
                    value="property_cancelled"
                    control={<Radio />}
                    label={`We cannot host: full refund ${money(preview.paidCents)}`}
                  />
                ) : null}
                {canManageRefunds ? (
                  <FormControlLabel value="goodwill" control={<Radio />} label="Goodwill or special case: you choose the refund" />
                ) : null}
              </RadioGroup>
              {canManageRefunds ? null : (
                <Typography variant="body2" color="text.secondary">
                  Full refunds and goodwill amounts are decided by an admin or someone with refund access. Ask one if this guest needs more than the policy refund.
                </Typography>
              )}
              {state.reason === 'goodwill' ? (
                <TextField
                  label="Refund amount (€)"
                  value={state.goodwillEuros}
                  onChange={(event): void => state.setGoodwillEuros(event.target.value)}
                  error={state.goodwillError !== null}
                  helperText={state.goodwillError ?? `From 0 up to ${money(preview.paidCents)}`}
                  slotProps={{ htmlInput: { inputMode: 'decimal' } }}
                  required
                />
              ) : null}
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
            </>
          ) : null}
          {state.error !== null ? <Alert severity="error">{state.error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button autoFocus onClick={onClose} disabled={state.saving}>
          Keep the booking
        </Button>
        <Button
          color="error"
          variant="contained"
          disabled={!state.canSubmit}
          onClick={(): void => void state.confirm()}
        >
          {state.saving ? 'Cancelling…' : confirmCancelLabel(state.refundCents, preview?.currencyCode ?? 'EUR')}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * @file apps/admin/src/features/refunds/components/mark-refund-paid-dialog.tsx
 * @feature refunds
 * @dependencies record-note, money
 */

'use client';

import type { StaffRefund } from '@resort-booking/shared-types';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { formatCents } from '@/shared/utils/money';
import { MAX_NOTE_LENGTH, noteProblem } from '@/shared/utils/record-note';

interface MarkRefundPaidDialogProps {
  open: boolean;
  refund: StaffRefund;
  saving: boolean;
  /** The last attempt failed (the API's message). */
  error: string | null;
  onClose: () => void;
  onConfirm: (note: string) => void;
}

/**
 * "I sent this money myself." Staff say how and when; that note stays on the refund with their
 * name. "Not yet" has the focus, so nothing is marked by accident.
 */
export function MarkRefundPaidDialog({ open, refund, saving, error, onClose, onConfirm }: MarkRefundPaidDialogProps): React.JSX.Element {
  const [note, setNote] = useState('');

  useEffect((): void => {
    if (open) {
      setNote('');
    }
  }, [open, refund.id]);

  const problem = noteProblem(note);
  const amount = formatCents(refund.amountCents, refund.currencyCode);

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="xs" aria-labelledby="mark-paid-title">
      <DialogTitle id="mark-paid-title">Mark {amount} as refunded?</DialogTitle>
      <DialogContent>
        <Typography sx={{ mb: 2 }}>
          Use this after you have sent the money yourself (for example by bank transfer). The booking {refund.reference} will show
          this refund as done.
        </Typography>
        {error !== null ? (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        ) : null}
        <TextField
          label="How and when did you send it?"
          value={note}
          onChange={(event): void => setNote(event.target.value)}
          error={note !== '' && problem !== null}
          helperText={
            note !== '' && problem !== null ? problem : `Kept on the record with your name. ${String(note.length)}/${String(MAX_NOTE_LENGTH)}`
          }
          multiline
          minRows={2}
          fullWidth
          required
        />
      </DialogContent>
      <DialogActions>
        <Button autoFocus onClick={onClose} disabled={saving}>
          Not yet
        </Button>
        <Button variant="contained" disabled={problem !== null || saving} onClick={(): void => onConfirm(note)}>
          {saving ? 'Saving…' : `Yes, I sent ${amount}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

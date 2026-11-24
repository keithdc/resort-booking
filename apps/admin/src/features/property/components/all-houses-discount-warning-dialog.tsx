/**
 * @file apps/admin/src/features/property/components/all-houses-discount-warning-dialog.tsx
 * @feature property
 * @dependencies none
 */

'use client';

import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';

interface AllHousesDiscountWarningDialogProps {
  label: string;
  /** The effect in words, e.g. "10%" or "20,00 €". */
  effectText: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Warning before a new discount goes live for every house at the property. Cancel is the
 * default focus on purpose.
 */
export function AllHousesDiscountWarningDialog({
  label,
  effectText,
  pending,
  onCancel,
  onConfirm,
}: AllHousesDiscountWarningDialogProps): React.JSX.Element {
  return (
    <Dialog open onClose={onCancel} fullWidth maxWidth="sm" aria-labelledby="all-houses-discount-title">
      <DialogTitle id="all-houses-discount-title">Apply this discount to every stay?</DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          &quot;{label}&quot; ({effectText} off) will apply to every stay at this property from now on, including stays
          you add later. Guests will see it on their price straight away.
        </Alert>
        <Typography color="text.secondary" variant="body2">
          Bookings that are already made keep the price the guest was quoted. To limit it to some stays, go back and
          choose them under &quot;Applies to&quot;.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button autoFocus onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={onConfirm} disabled={pending}>
          {pending ? 'Applying…' : 'Apply to all stays'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

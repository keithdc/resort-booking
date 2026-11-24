/**
 * @file apps/admin/src/features/property/components/bulk-rate-warning-dialog.tsx
 * @feature property
 * @dependencies money — shows the API preview; the API decides who clashes
 */

'use client';

import type { BulkRatePeriodPreview, RatePeriodWrite } from '@resort-booking/shared-types';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItem, Typography } from '@mui/material';
import { formatCents } from '@/shared/utils/money';

interface BulkRateWarningDialogProps {
  preview: BulkRatePeriodPreview;
  write: RatePeriodWrite;
  currencyCode: string;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * Warning before one seasonal rate is written to many houses at once. Lists the houses that
 * clash (they are skipped, never overwritten). Cancel is the default focus on purpose.
 */
export function BulkRateWarningDialog({
  preview,
  write,
  currencyCode,
  pending,
  onCancel,
  onConfirm,
}: BulkRateWarningDialogProps): React.JSX.Element {
  const clashing = preview.results.filter((result): boolean => result.status === 'conflict');
  const total = preview.results.length;
  return (
    <Dialog open onClose={onCancel} fullWidth maxWidth="sm" aria-labelledby="bulk-rate-title">
      <DialogTitle id="bulk-rate-title">
        Change the price of {String(total)} house{total === 1 ? '' : 's'} at once?
      </DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          This applies &quot;{write.label}&quot; ({write.startDate} to {write.endDate}) at{' '}
          {formatCents(write.nightlyRateCents, currencyCode)} per night to{' '}
          <strong>
            {String(preview.addCount)} house{preview.addCount === 1 ? '' : 's'}
          </strong>
          . Guests will see the new price on those nights straight away.
        </Alert>
        {clashing.length > 0 ? (
          <>
            <Typography sx={{ fontWeight: 600 }}>
              {String(clashing.length)} house{clashing.length === 1 ? '' : 's'} already {clashing.length === 1 ? 'has' : 'have'} a
              rate on these dates and will be skipped:
            </Typography>
            <List dense aria-label="Houses that will be skipped">
              {clashing.map((result): React.JSX.Element => (
                <ListItem key={result.houseId}>
                  {result.houseName}
                  {result.conflict === null
                    ? ''
                    : ` clashes with "${result.conflict.label}" (${result.conflict.startDate} to ${result.conflict.endDate})`}
                </ListItem>
              ))}
            </List>
            <Typography color="text.secondary" variant="body2">
              Nothing is overwritten. To change one of those houses, edit its own seasonal rates.
            </Typography>
          </>
        ) : null}
        <Typography color="text.secondary" variant="body2" sx={{ mt: 2 }}>
          Stays that are already booked keep the price the guest was quoted.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button autoFocus onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={onConfirm} disabled={pending || preview.addCount === 0}>
          {pending ? 'Applying…' : `Add to ${String(preview.addCount)} house${preview.addCount === 1 ? '' : 's'}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

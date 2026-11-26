/**
 * @file apps/admin/src/features/refunds/components/refund-detail-dialog.tsx
 * @feature refunds
 * @dependencies booking-labels, money
 */

'use client';

import type { StaffRefund } from '@resort-booking/shared-types';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import {
  canMarkRefundPaid,
  canRetryRefund,
  formatDateTime,
  initiatorLabel,
  reasonLabel,
  refundKindLabel,
  resolvedByHandText,
} from '@/shared/utils/booking-labels';
import { StatusChip } from '@/shared/components/status-chip';
import { formatCents } from '@/shared/utils/money';
import { refundStyle } from '@/shared/utils/status-style';

interface RefundDetailDialogProps {
  refund: StaffRefund | null;
  busy: boolean;
  /** The last action failed (the API's message). */
  error: string | null;
  onClose: () => void;
  onRetry: (refund: StaffRefund) => void;
  onMarkPaid: (refund: StaffRefund) => void;
}

/**
 * Everything about one refund, with the two things staff can do: ask the provider again, or say
 * they sent the money themselves.
 */
export function RefundDetailDialog({ refund, busy, error, onClose, onRetry, onMarkPaid }: RefundDetailDialogProps): React.JSX.Element {
  return (
    <Dialog open={refund !== null} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="refund-detail-title">
      {refund !== null ? (
        <>
          <DialogTitle id="refund-detail-title">
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="h6" component="span">
                {formatCents(refund.amountCents, refund.currencyCode)} · {refund.reference}
              </Typography>
              <StatusChip status={refundStyle(refund.status)} />
            </Stack>
          </DialogTitle>
          <DialogContent>
            {error !== null ? (
              <Alert severity="error" sx={{ mb: 2 }}>
                {error}
              </Alert>
            ) : null}
            {refund.failureReason !== null ? (
              <Alert severity="warning" sx={{ mb: 2 }}>
                The provider could not send this refund: {refund.failureReason}
              </Alert>
            ) : null}
            {refund.status === 'pending' && refund.provider === 'manual' ? (
              <Alert severity="info" sx={{ mb: 2 }}>
                This refund has to be sent by hand. Send the money, then mark it as refunded.
              </Alert>
            ) : null}
            <Box component="dl" sx={{ m: 0, display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: 3, rowGap: 0.75 }}>
              <Fact term="Guest" value={`${refund.bookerName} (${refund.bookerEmail})`} />
              <Fact term="Stay" value={`${refund.stayName}, ${refund.propertyName}`} />
              <Fact term="Kind" value={refundKindLabel(refund.kind)} />
              <Fact term="Amount" value={`${formatCents(refund.amountCents, refund.currencyCode)} (${String(refund.percent)}%)`} />
              <Fact term="Reason" value={reasonLabel(refund.reason)} />
              <Fact term="Asked by" value={initiatorLabel(refund.initiatedBy, null)} />
              <Fact term="Provider" value={refund.provider === 'manual' ? 'By hand (no online payment)' : refund.provider} />
              <Fact term="Created" value={formatDateTime(refund.createdAt)} />
              {resolvedByHandText(refund) !== null ? <Fact term="Resolved" value={resolvedByHandText(refund) ?? ''} /> : null}
            </Box>
          </DialogContent>
          <DialogActions>
            <Button autoFocus onClick={onClose} disabled={busy}>
              Close
            </Button>
            {canRetryRefund(refund) ? (
              <Button variant="outlined" disabled={busy} onClick={(): void => onRetry(refund)}>
                {busy ? 'Working…' : 'Retry'}
              </Button>
            ) : null}
            {canMarkRefundPaid(refund) ? (
              <Button variant="contained" disabled={busy} onClick={(): void => onMarkPaid(refund)}>
                Mark as refunded…
              </Button>
            ) : null}
          </DialogActions>
        </>
      ) : null}
    </Dialog>
  );
}

function Fact({ term, value }: { term: string; value: string }): React.JSX.Element {
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

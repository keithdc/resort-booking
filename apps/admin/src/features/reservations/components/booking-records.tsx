/**
 * @file apps/admin/src/features/reservations/components/booking-records.tsx
 * @feature reservations
 * @dependencies booking-labels, money — shows what the API recorded
 */

import type { StaffBookingChange, StaffCancellation, StaffRefund, StaffReservation } from '@resort-booking/shared-types';
import { Box, Chip, Stack, Typography } from '@mui/material';
import {
  cancellationSummary,
  changeSummary,
  formatDateTime,
  initiatorLabel,
  refundKindLabel,
  refundStatusColor,
  refundStatusLabel,
  resolvedByHandText,
} from '@/shared/utils/booking-labels';
import { formatCents } from '@/shared/utils/money';
import { StayBlock, StayFact } from './stay-block';

interface CancellationBlockProps {
  cancellation: StaffCancellation;
}

/**
 * Who cancelled the booking, why, when, and the note that was kept.
 */
export function CancellationBlock({ cancellation }: CancellationBlockProps): React.JSX.Element {
  return (
    <StayBlock title="Cancellation">
      <StayFact label="What happened" value={cancellationSummary(cancellation)} />
      <StayFact label="When" value={formatDateTime(cancellation.cancelledAt)} />
      <StayFact label="Note" value={cancellation.note === null || cancellation.note.trim() === '' ? 'No note' : cancellation.note} />
    </StayBlock>
  );
}

interface RefundsBlockProps {
  refunds: readonly StaffRefund[];
}

/**
 * Every refund recorded for the booking, with its status and anything staff did by hand.
 */
export function RefundsBlock({ refunds }: RefundsBlockProps): React.JSX.Element {
  return (
    <StayBlock title="Refunds">
      {refunds.length === 0 ? (
        <Typography color="text.secondary">No refunds recorded</Typography>
      ) : (
        <Box component="ul" aria-label="Refunds" sx={{ m: 0, p: 0, listStyle: 'none' }}>
          {refunds.map((refund): React.JSX.Element => (
            <Box component="li" key={refund.id} sx={{ mb: 1.25 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                <Typography sx={{ fontWeight: 600 }}>
                  {refundKindLabel(refund.kind)}: {formatCents(refund.amountCents, refund.currencyCode)} ({String(refund.percent)}%)
                </Typography>
                <Chip size="small" color={refundStatusColor(refund.status)} label={refundStatusLabel(refund.status)} />
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {refund.provider === 'manual' ? 'To be sent by hand' : `Via ${refund.provider}`} · asked by{' '}
                {initiatorLabel(refund.initiatedBy, null)} · {formatDateTime(refund.createdAt)}
              </Typography>
              {refund.failureReason !== null ? (
                <Typography variant="body2" color="error">
                  Failed: {refund.failureReason}
                </Typography>
              ) : null}
              {resolvedByHandText(refund) !== null ? <Typography variant="body2">{resolvedByHandText(refund)}</Typography> : null}
            </Box>
          ))}
        </Box>
      )}
    </StayBlock>
  );
}

interface HistoryBlockProps {
  stay: Pick<StaffReservation, 'changes' | 'currencyCode' | 'replacedByReference' | 'rebookOfReference'>;
}

/**
 * Date changes, oldest first, and the links to the booking that replaced this one or that it replaced.
 */
export function HistoryBlock({ stay }: HistoryBlockProps): React.JSX.Element {
  return (
    <StayBlock title="History">
      {stay.replacedByReference !== null ? (
        <Typography>Replaced by {stay.replacedByReference}</Typography>
      ) : null}
      {stay.rebookOfReference !== null ? <Typography>Replaces {stay.rebookOfReference}</Typography> : null}
      {stay.changes.length === 0 ? (
        <Typography color="text.secondary">No date changes</Typography>
      ) : (
        <Box component="ul" aria-label="Date changes" sx={{ m: 0, p: 0, listStyle: 'none' }}>
          {stay.changes.map((change: StaffBookingChange): React.JSX.Element => (
            <Box component="li" key={change.id} sx={{ mb: 1.25 }}>
              <Typography sx={{ fontWeight: 600 }}>{changeSummary(change, stay.currencyCode)}</Typography>
              <Typography variant="body2" color="text.secondary">
                By {initiatorLabel(change.initiatedBy, change.staffName)} · {formatDateTime(change.createdAt)}
                {change.note !== null && change.note.trim() !== '' ? ` · ${change.note}` : ''}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </StayBlock>
  );
}

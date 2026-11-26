/**
 * @file apps/admin/src/features/reporting/components/cancellations-tab.tsx
 * @feature reporting
 * @dependencies cancellation-summary
 */

import { Box, Link as MuiLink, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import type { StaffRefund, StaffReport } from '@resort-booking/shared-types';
import NextLink from 'next/link';
import { StatusChip } from '@/shared/components/status-chip';
import { reasonLabel } from '@/shared/utils/booking-labels';
import { formatIsoDate } from '@/shared/utils/format-date';
import { formatCents } from '@/shared/utils/money';
import { refundStyle } from '@/shared/utils/status-style';
import { summarizeCancellations, type ReasonBar } from '../utils/cancellation-summary';
import type { MetricKey } from '../utils/metric-definitions';
import { MetricInfo } from './metric-info';
import { useMoneyHidden } from './money-visibility';
import { EmptyNote, ReportSection } from './report-section';
import { stickyFirstColumn } from '@/shared/utils/sticky-first-column';

interface CancellationsTabProps {
  report: StaffReport;
}

/**
 * Who cancelled, why, and what it cost: totals, the reasons, and the refunds themselves.
 */
export function CancellationsTab({ report }: CancellationsTabProps): React.JSX.Element {
  const moneyHidden = useMoneyHidden();
  const summary = summarizeCancellations(report);
  const money = (cents: number): string => formatCents(cents, report.currencyCode);
  const allTiles: { metric: MetricKey; label: string; value: string }[] = [
    { metric: 'cancelledBookings', label: 'Cancelled bookings', value: String(summary.cancelledCount) },
    { metric: 'cancellationRate', label: 'Cancellation rate', value: `${summary.ratePercent}%` },
    { metric: 'refunded', label: 'Refunded', value: money(summary.refundedCents) },
    { metric: 'keptFromCancellations', label: 'Kept from cancellations', value: money(summary.keptCents) },
    { metric: 'refundsToPay', label: 'Refunds to pay', value: String(report.attention.refundsToPayCount) },
  ];
  const tiles = moneyHidden ? allTiles.filter((tile): boolean => tile.metric !== 'refunded' && tile.metric !== 'keptFromCancellations') : allTiles;

  return (
    <>
      <ReportSection section="cancellationSummary">
        {summary.cancelledCount === 0 ? (
          <EmptyNote state="noCancellations" />
        ) : (
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(5, 1fr)' } }}>
            {tiles.map((tile): React.JSX.Element => (
              <Paper key={tile.metric} variant="outlined" sx={{ p: 2, borderRadius: 2, breakInside: 'avoid' }}>
                <Typography variant="caption" color="text.secondary" component="h4" sx={{ display: 'inline' }}>
                  {tile.label}
                </Typography>{' '}
                <MetricInfo metric={tile.metric} />
                <Typography variant="h5" component="p" sx={{ fontWeight: 600 }}>
                  {tile.value}
                </Typography>
              </Paper>
            ))}
          </Box>
        )}
        {report.attention.refundsToPayCount > 0 ? (
          <Typography sx={{ mt: 2 }}>
            {report.attention.refundsToPayCount} {report.attention.refundsToPayCount === 1 ? 'refund still needs' : 'refunds still need'} paying.{' '}
            <MuiLink component={NextLink} href="/refunds" data-print="hide">
              Open the Refunds page
            </MuiLink>
          </Typography>
        ) : null}
      </ReportSection>

      <ReportSection section="cancellationReasons">
        {summary.reasons.length === 0 ? (
          <EmptyNote state="noCancellations" />
        ) : (
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5, maxWidth: 640 }}>
            {summary.reasons.map((reason: ReasonBar): React.JSX.Element => (
              <li key={reason.reason}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
                  <Typography>{reason.label}</Typography>
                  <Typography color="text.secondary">
                    {reason.cancelledCount} · {reason.sharePercent}%
                  </Typography>
                </Box>
                <Box aria-hidden sx={{ height: 8, borderRadius: 4, bgcolor: 'action.hover', overflow: 'hidden' }}>
                  <Box sx={{ width: `${reason.sharePercent}%`, height: '100%', bgcolor: 'warning.main' }} />
                </Box>
              </li>
            ))}
          </Box>
        )}
      </ReportSection>

      {moneyHidden ? null : (
        <ReportSection section="refundsList">
          {report.refunds.length === 0 ? (
            <EmptyNote state="noRefunds" />
          ) : (
            <TableContainer sx={stickyFirstColumn}>
              <Table size="small" aria-label="Refunds for cancelled bookings">
                <TableHead>
                  <TableRow>
                    <TableCell>Booking</TableCell>
                    <TableCell>Guest</TableCell>
                    <TableCell>Reason</TableCell>
                    <TableCell align="right">Refunded</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Date</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {report.refunds.map((refund: StaffRefund): React.JSX.Element => (
                    <TableRow key={refund.id} hover>
                      <TableCell sx={{ fontFamily: 'monospace' }}>{refund.reference}</TableCell>
                      <TableCell>
                        {refund.bookerName}
                        <Typography variant="caption" color="text.secondary" display="block">
                          {refund.stayName}, {refund.propertyName}
                        </Typography>
                      </TableCell>
                      <TableCell>{reasonLabel(refund.reason)}</TableCell>
                      <TableCell align="right">
                        {formatCents(refund.amountCents, refund.currencyCode)} ({refund.percent}%)
                      </TableCell>
                      <TableCell>
                        <StatusChip status={refundStyle(refund.status)} />
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatIsoDate(refund.createdAt.slice(0, 10))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </ReportSection>
      )}
    </>
  );
}

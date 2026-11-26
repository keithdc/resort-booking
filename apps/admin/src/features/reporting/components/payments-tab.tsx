/**
 * @file apps/admin/src/features/reporting/components/payments-tab.tsx
 * @feature reporting
 * @dependencies payment-shares
 */

import { Box, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import type { DiscountUsageRow, StaffReport } from '@resort-booking/shared-types';
import { formatCents } from '@/shared/utils/money';
import { buildPaymentShares, type PaymentShare } from '../utils/payment-shares';
import { MetricInfo } from './metric-info';
import { useMoneyHidden } from './money-visibility';
import { EmptyNote, ReportSection } from './report-section';
import { stickyFirstColumn } from '@/shared/utils/sticky-first-column';

interface PaymentsTabProps {
  report: StaffReport;
}

/**
 * How guests paid, and how much the discounts and promo codes took off.
 */
export function PaymentsTab({ report }: PaymentsTabProps): React.JSX.Element {
  const shares = buildPaymentShares(report.paymentMethods);
  const moneyHidden = useMoneyHidden();
  return (
    <>
      <ReportSection section="paymentMethods">
        {shares.length === 0 ? (
          <EmptyNote state="noPayments" />
        ) : (
          <Box component="ul" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 2, maxWidth: 640 }}>
            {shares.map((share: PaymentShare): React.JSX.Element => (
              <li key={share.method}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                  <Typography sx={{ fontWeight: 600 }}>{share.label}</Typography>
                  <Typography color="text.secondary">
                    {share.bookings} {share.bookings === 1 ? 'booking' : 'bookings'} · {formatCents(share.revenueCents, report.currencyCode)} · {share.sharePercent}%
                  </Typography>
                </Box>
                <Box aria-hidden sx={{ height: 10, borderRadius: 5, bgcolor: 'action.hover', overflow: 'hidden' }}>
                  <Box sx={{ width: `${share.sharePercent}%`, height: '100%', bgcolor: share.method === 'bank_transfer' ? 'secondary.main' : 'primary.main' }} />
                </Box>
              </li>
            ))}
          </Box>
        )}
        {report.unpaidAtHotelCents > 0 && !moneyHidden ? (
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2, maxWidth: 640 }}>
            Of this, {formatCents(report.unpaidAtHotelCents, report.currencyCode)} comes from pay-at-hotel bookings not marked as paid yet. <MetricInfo metric="toCollect" />
          </Typography>
        ) : null}
      </ReportSection>

      <ReportSection section="discounts">
        {report.discountUsage.length === 0 ? (
          <EmptyNote state="noDiscounts" />
        ) : (
          <TableContainer sx={stickyFirstColumn}>
            <Table size="small" aria-label="Discounts used in this period">
              <TableHead>
                <TableRow>
                  <TableCell>Discount</TableCell>
                  <TableCell align="right">
                    Times used <MetricInfo metric="discountUses" />
                  </TableCell>
                  <TableCell align="right">
                    Discount given <MetricInfo metric="discountGiven" />
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {report.discountUsage.map((row: DiscountUsageRow): React.JSX.Element => (
                  <TableRow key={row.discountId} hover>
                    <TableCell>{row.label}</TableCell>
                    <TableCell align="right">{row.redemptionCount}</TableCell>
                    <TableCell align="right">{formatCents(row.discountCents, report.currencyCode)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Total</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    {report.discountUsage.reduce((sum: number, row: DiscountUsageRow): number => sum + row.redemptionCount, 0)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    {formatCents(report.discountUsage.reduce((sum: number, row: DiscountUsageRow): number => sum + row.discountCents, 0), report.currencyCode)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </ReportSection>
    </>
  );
}

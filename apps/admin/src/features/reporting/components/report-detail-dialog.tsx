/**
 * @file apps/admin/src/features/reporting/components/report-detail-dialog.tsx
 * @feature reporting
 * @dependencies staff reservation rows from the report payload
 */

'use client';

import type { StaffReservation } from '@resort-booking/shared-types';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Link as MuiLink,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { formatCents } from '@/shared/utils/money';
import { bookingStatusLabel, paymentMethodLabel } from '../utils/report-labels';
import { useMoneyHidden } from './money-visibility';

export interface ReportDetail {
  title: string;
  caption: string;
  stays: StaffReservation[];
}

interface ReportDetailDialogProps {
  detail: ReportDetail | null;
  onClose: () => void;
}

/**
 * The bookings behind a bar or a row of the report.
 */
export function ReportDetailDialog({ detail, onClose }: ReportDetailDialogProps): React.JSX.Element {
  const moneyHidden = useMoneyHidden();
  return (
    <Dialog open={detail !== null} onClose={onClose} fullWidth maxWidth="md">
      {detail !== null ? (
        <>
          <DialogTitle>
            {detail.title}
            <Typography variant="body2" color="text.secondary">
              {detail.caption}
            </Typography>
          </DialogTitle>
          <DialogContent>
            {detail.stays.length === 0 ? (
              <Typography color="text.secondary">No bookings here. Try a longer period.</Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Guest</TableCell>
                    <TableCell>Property</TableCell>
                    <TableCell>Stay</TableCell>
                    <TableCell>Dates</TableCell>
                    <TableCell>Guests</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Pay</TableCell>
                    {moneyHidden ? null : <TableCell>Total</TableCell>}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {detail.stays.map((stay): React.JSX.Element => (
                    <TableRow key={stay.id} hover>
                      <TableCell>
                        <Typography>{stay.bookerName}</Typography>
                        <MuiLink href={`mailto:${stay.bookerEmail}`}>{stay.bookerEmail}</MuiLink>
                      </TableCell>
                      <TableCell>{stay.propertyName}</TableCell>
                      <TableCell>{stay.houseName}</TableCell>
                      <TableCell>
                        {stay.checkIn} → {stay.checkOut}
                      </TableCell>
                      <TableCell>{stay.guestCount}</TableCell>
                      <TableCell>{bookingStatusLabel(stay)}</TableCell>
                      <TableCell>{paymentMethodLabel(stay.paymentMethod)}</TableCell>
                      {moneyHidden ? null : <TableCell>{formatCents(stay.totalCents, stay.currencyCode)}</TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </DialogContent>
          <DialogActions>
            <Button onClick={onClose}>Close</Button>
          </DialogActions>
        </>
      ) : null}
    </Dialog>
  );
}

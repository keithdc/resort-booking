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
 * Stay list behind a KPI, bar, or payment chip.
 */
export function ReportDetailDialog({ detail, onClose }: ReportDetailDialogProps): React.JSX.Element {
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
              <Typography color="text.secondary">No stays in this slice.</Typography>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Guest</TableCell>
                    <TableCell>Property</TableCell>
                    <TableCell>House</TableCell>
                    <TableCell>Dates</TableCell>
                    <TableCell>Guests</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Pay</TableCell>
                    <TableCell>Total</TableCell>
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
                      <TableCell>{statusLabel(stay)}</TableCell>
                      <TableCell>
                        {stay.paymentMethod === 'bank_transfer'
                          ? 'Bank transfer'
                          : stay.paymentMethod === 'card'
                            ? 'Card / wallets'
                            : '—'}
                      </TableCell>
                      <TableCell>{formatCents(stay.totalCents, stay.currencyCode)}</TableCell>
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

function statusLabel(stay: StaffReservation): string {
  if (stay.rebookOfId !== null) {
    return `Rebook · ${stay.status}`;
  }
  if (stay.status === 'active') {
    return 'Pending payment';
  }
  if (stay.status === 'released') {
    return 'Released hold';
  }
  if (stay.status === 'cancelled') {
    return 'Cancelled';
  }
  if (stay.status === 'expired') {
    return 'Expired hold';
  }
  if (stay.status === 'confirmed' && stay.arrivalStatus === 'checked_in') {
    return 'In-house';
  }
  if (stay.status === 'confirmed' && stay.arrivalStatus === 'checked_out') {
    return 'Checked out';
  }
  if (stay.status === 'confirmed') {
    return 'Confirmed';
  }
  return stay.status;
}

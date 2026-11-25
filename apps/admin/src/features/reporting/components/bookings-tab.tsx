/**
 * @file apps/admin/src/features/reporting/components/bookings-tab.tsx
 * @feature reporting
 * @dependencies bookings-filter, StayDetailDialog
 */

'use client';

import ClearIcon from '@mui/icons-material/Clear';
import SearchIcon from '@mui/icons-material/Search';
import {
  Box,
  Button,
  Chip,
  IconButton,
  InputAdornment,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import type { StaffReport, StaffReservation } from '@resort-booking/shared-types';
import { useMemo, useState } from 'react';
import { StayDetailDialog } from '@/features/reservations/components/stay-detail-dialog';
import { StatusChip, statusIcon } from '@/shared/components/status-chip';
import { bookingFilterStyle } from '@/shared/utils/status-style';
import { formatCents } from '@/shared/utils/money';
import { formatIsoDate } from '@/shared/utils/format-date';
import { countByStatus, filterBookings, withReportRefunds } from '../utils/bookings-filter';
import {
  BOOKING_STATUS_OPTIONS,
  bookingNights,
  bookingStatusKey,
  bookingStatusLabel,
  paymentMethodLabel,
  type BookingStatusKey,
} from '../utils/report-labels';
import { EmptyNote, ReportSection } from './report-section';

const PAGE_SIZE = 50;

interface BookingsTabProps {
  report: StaffReport;
  status: BookingStatusKey | null;
  onStatusChange: (status: BookingStatusKey | null) => void;
  /** A booking was changed or cancelled from its detail: reload the report. */
  onChanged: () => void;
}

/**
 * The bookings behind the numbers: search, a status filter, and a click on a row opens the booking.
 */
export function BookingsTab({ report, status, onStatusChange, onChanged }: BookingsTabProps): React.JSX.Element {
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<StaffReservation | null>(null);
  const counts = useMemo(() => countByStatus(report.pipeline), [report.pipeline]);
  const rows = useMemo((): StaffReservation[] => filterBookings(report.pipeline, status, search), [report.pipeline, status, search]);
  const visible = rows.slice(0, shown);

  const open = (row: StaffReservation): void => {
    setSelected(withReportRefunds(row, report.refunds));
  };

  return (
    <ReportSection section="bookingsTable">
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} sx={{ mb: 2 }} alignItems={{ md: 'center' }} data-print="hide">
        <TextField
          size="small"
          label="Search bookings"
          placeholder="Guest, email, reference or stay"
          value={search}
          onChange={(event): void => {
            setSearch(event.target.value);
            setShown(PAGE_SIZE);
          }}
          sx={{ minWidth: { md: 320 } }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" aria-hidden />
                </InputAdornment>
              ),
              endAdornment:
                search === '' ? null : (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      aria-label="Clear search"
                      onClick={(): void => {
                        setSearch('');
                        setShown(PAGE_SIZE);
                      }}
                    >
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
            },
          }}
        />
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" role="group" aria-label="Filter by status">
          <Chip
            label={`All (${report.pipeline.length})`}
            color={status === null ? 'primary' : 'default'}
            variant={status === null ? 'filled' : 'outlined'}
            aria-pressed={status === null}
            onClick={(): void => onStatusChange(null)}
          />
          {BOOKING_STATUS_OPTIONS.map((option): React.JSX.Element => (
            <Chip
              key={option.value}
              icon={statusIcon(bookingFilterStyle(option.value).icon)}
              label={`${option.label} (${counts[option.value]})`}
              color={status === option.value ? 'primary' : 'default'}
              variant={status === option.value ? 'filled' : 'outlined'}
              aria-pressed={status === option.value}
              onClick={(): void => onStatusChange(status === option.value ? null : option.value)}
            />
          ))}
        </Stack>
      </Stack>

      {report.pipeline.length === 0 ? (
        <EmptyNote state="noBookings" />
      ) : rows.length === 0 ? (
        <EmptyNote state="noSearchMatches" />
      ) : (
        <>
          <Typography variant="body2" color="text.secondary" aria-live="polite" sx={{ mb: 1 }}>
            {rows.length} {rows.length === 1 ? 'booking' : 'bookings'}
          </Typography>
          <TableContainer>
            <Table size="small" aria-label="Bookings in this period">
              <TableHead>
                <TableRow>
                  <TableCell>Reference</TableCell>
                  <TableCell>Guest</TableCell>
                  <TableCell>Stay</TableCell>
                  <TableCell>Dates</TableCell>
                  <TableCell align="right">Nights</TableCell>
                  <TableCell align="right">Guests</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell>Payment</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {visible.map((row: StaffReservation): React.JSX.Element => (
                  <TableRow key={row.id} hover>
                    <TableCell>
                      <Button size="small" onClick={(): void => open(row)} aria-label={`Open booking ${row.reference === '' ? row.bookerName : row.reference}`} sx={{ textTransform: 'none', fontFamily: 'monospace' }}>
                        {row.reference === '' ? 'Open' : row.reference}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{row.bookerName}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {row.bookerEmail}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2">{row.houseName}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {row.propertyName}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {formatIsoDate(row.checkIn)} → {formatIsoDate(row.checkOut)}
                    </TableCell>
                    <TableCell align="right">{bookingNights(row)}</TableCell>
                    <TableCell align="right">{row.guestCount}</TableCell>
                    <TableCell align="right">{formatCents(row.totalCents, row.currencyCode)}</TableCell>
                    <TableCell>{paymentMethodLabel(row.paymentMethod)}</TableCell>
                    <TableCell>
                      <StatusChip status={bookingFilterStyle(bookingStatusKey(row))} label={bookingStatusLabel(row)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          {rows.length > visible.length ? (
            <Box sx={{ mt: 2, textAlign: 'center' }} data-print="hide">
              <Button onClick={(): void => setShown(shown + PAGE_SIZE)}>Show {Math.min(PAGE_SIZE, rows.length - visible.length)} more</Button>
            </Box>
          ) : null}
        </>
      )}
      <StayDetailDialog
        stay={selected}
        onClose={(): void => setSelected(null)}
        onUpdated={(updated: StaffReservation): void => setSelected(updated)}
        onChanged={onChanged}
      />
    </ReportSection>
  );
}

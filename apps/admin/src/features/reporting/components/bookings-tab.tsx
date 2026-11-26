/**
 * @file apps/admin/src/features/reporting/components/bookings-tab.tsx
 * @feature reporting
 * @dependencies bookings-filter, StayDetailDialog
 */

'use client';

import ClearIcon from '@mui/icons-material/Clear';
import SearchIcon from '@mui/icons-material/Search';
import {
  Alert,
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
  BOOKING_FILTER_OPTIONS,
  bookingNights,
  bookingStatusKey,
  bookingStatusLabel,
  bookingPaymentLabel,
  isUnpaidAtHotel,
  unpaidArrivalHint,
  type BookingFilter,
} from '../utils/report-labels';
import { MetricInfo } from './metric-info';
import { useMoneyHidden } from './money-visibility';
import { EmptyNote, ReportSection } from './report-section';
import { useCompactLayout } from '@/shared/hooks/use-compact-layout';
import { stickyFirstColumn } from '@/shared/utils/sticky-first-column';

const PAGE_SIZE = 50;

interface BookingsTabProps {
  report: StaffReport;
  status: BookingFilter | null;
  onStatusChange: (status: BookingFilter | null) => void;
  /** A booking was changed or cancelled from its detail: reload the report. */
  onChanged: () => void;
}

/**
 * The bookings behind the numbers: search, a status filter, and a click on a row opens the booking.
 */
export function BookingsTab({ report, status, onStatusChange, onChanged }: BookingsTabProps): React.JSX.Element {
  const moneyHidden = useMoneyHidden();
  const compact = useCompactLayout();
  const [search, setSearch] = useState('');
  const [shown, setShown] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState<StaffReservation | null>(null);
  const counts = useMemo(() => countByStatus(report.pipeline), [report.pipeline]);
  const rows = useMemo((): StaffReservation[] => filterBookings(report.pipeline, status, search), [report.pipeline, status, search]);
  const visible = rows.slice(0, shown);
  const unpaidCount = report.unpaidAtHotelCount;

  const open = (row: StaffReservation): void => {
    setSelected(withReportRefunds(row, report.refunds));
  };

  return (
    <ReportSection section="bookingsTable">
      {unpaidCount > 0 ? (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          data-print="hide"
          action={
            status === 'unpaid_at_hotel' ? null : (
              <Button color="inherit" size="small" onClick={(): void => onStatusChange('unpaid_at_hotel')}>
                Show them
              </Button>
            )
          }
        >
          {`${String(unpaidCount)} ${unpaidCount === 1 ? 'booking is' : 'bookings are'} unpaid at the hotel in this period`}
          {moneyHidden ? '.' : `: ${formatCents(report.unpaidAtHotelCents, report.currencyCode)} still to collect.`}
          <MetricInfo metric="toCollect" />
        </Alert>
      ) : null}
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
          {BOOKING_FILTER_OPTIONS.map((option): React.JSX.Element => (
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
          {compact ? (
            <Box component="ul" aria-label="Bookings in this period" sx={{ listStyle: 'none', m: 0, p: 0, display: 'grid', gap: 1.5 }}>
              {visible.map((row: StaffReservation): React.JSX.Element => (
                <Box component="li" key={row.id} sx={{ p: 1.5, border: 1, borderColor: 'divider', borderRadius: 2, bgcolor: 'background.paper' }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={1}>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontWeight: 600 }}>{row.bookerName}</Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
                        {row.bookerEmail}
                      </Typography>
                    </Box>
                    {moneyHidden ? null : (
                      <Typography sx={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{formatCents(row.totalCents, row.currencyCode)}</Typography>
                    )}
                  </Stack>
                  <Typography variant="body2" sx={{ mt: 0.75 }}>
                    {row.houseName} · {row.propertyName}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {formatIsoDate(row.checkIn)} → {formatIsoDate(row.checkOut)} · {bookingNights(row)} nights · {row.guestCount} guests
                  </Typography>
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mt: 1 }}>
                    <StatusChip status={bookingFilterStyle(bookingStatusKey(row))} label={bookingStatusLabel(row)} />
                    <Chip size="small" variant="outlined" label={bookingPaymentLabel(row)} />
                    <ArrivalHintChip row={row} today={report.asOfDate} />
                  </Stack>
                  <Button
                    fullWidth
                    variant="outlined"
                    size="small"
                    onClick={(): void => open(row)}
                    aria-label={`Open booking ${row.reference === '' ? row.bookerName : row.reference}`}
                    sx={{ mt: 1.5, textTransform: 'none' }}
                  >
                    Open {row.reference === '' ? 'booking' : row.reference}
                  </Button>
                </Box>
              ))}
            </Box>
          ) : (
          <TableContainer sx={stickyFirstColumn}>
            <Table size="small" aria-label="Bookings in this period">
              <TableHead>
                <TableRow>
                  <TableCell>Reference</TableCell>
                  <TableCell>Guest</TableCell>
                  <TableCell>Stay</TableCell>
                  <TableCell>Dates</TableCell>
                  <TableCell align="right">Nights</TableCell>
                  <TableCell align="right">Guests</TableCell>
                  {moneyHidden ? null : <TableCell align="right">Amount</TableCell>}
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
                    {moneyHidden ? null : <TableCell align="right">{formatCents(row.totalCents, row.currencyCode)}</TableCell>}
                    <TableCell>
                      {bookingPaymentLabel(row)}
                      <ArrivalHintChip row={row} today={report.asOfDate} />
                    </TableCell>
                    <TableCell>
                      <StatusChip status={bookingFilterStyle(bookingStatusKey(row))} label={bookingStatusLabel(row)} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          )}
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

/**
 * For a booking still unpaid at the hotel: how soon the guest arrives (or that they already did), so the money to
 * collect first stands out. Nothing for any other booking or for an arrival more than a week away.
 */
function ArrivalHintChip({ row, today }: { row: StaffReservation; today: string }): React.JSX.Element | null {
  const hint = isUnpaidAtHotel(row) ? unpaidArrivalHint(row.checkIn, today) : null;
  return hint === null ? null : <Chip size="small" color="warning" variant="outlined" label={hint} sx={{ ml: 1 }} />;
}

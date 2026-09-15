/**
 * @file apps/admin/src/features/reservations/components/occupancy-calendar.tsx
 * @feature reservations
 * @dependencies staff calendar API — no occupancy math
 */

'use client';

import type { CalendarDayOccupancy, PropertySummary, StaffReservation } from '@resort-booking/shared-types';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiRequestError } from '@/shared/services/api-client';
import { formatCents } from '@/shared/utils/money';
import { currentMonthBounds, monthBounds, type MonthBounds } from '@/shared/utils/month-bounds';
import { fetchStaffCalendar, fetchStaffReservationsOnDate } from '../services/staff-reservations-api';
import { StayDetailDialog } from './stay-detail-dialog';

interface OccupancyCalendarProps {
  properties: PropertySummary[];
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const ALL_PROPERTIES = 'all';

/**
 * Full staff month calendar. Past days stay clickable.
 * Day details sit under the grid. Click a guest name to open the full stay.
 */
export function OccupancyCalendar({ properties }: OccupancyCalendarProps): React.JSX.Element {
  const [month, setMonth] = useState<MonthBounds>(() => currentMonthBounds(new Date()));
  const [propertyId, setPropertyId] = useState('');
  const [days, setDays] = useState<CalendarDayOccupancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [dayGuests, setDayGuests] = useState<StaffReservation[]>([]);
  const [dayLoading, setDayLoading] = useState(false);
  const [openStayId, setOpenStayId] = useState<string | null>(null);

  const occupancy = useMemo((): Map<string, CalendarDayOccupancy> => {
    const map = new Map<string, CalendarDayOccupancy>();
    for (const day of days) {
      map.set(day.date, day);
    }
    return map;
  }, [days]);

  const loadCalendar = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const calendar = await fetchStaffCalendar(month.from, month.to, propertyId);
      setDays(calendar.days);
    } catch (err: unknown) {
      setDays([]);
      setError(err instanceof ApiRequestError ? err.message : 'Could not load calendar');
    } finally {
      setLoading(false);
    }
  }, [month.from, month.to, propertyId]);

  useEffect((): void => {
    void loadCalendar();
  }, [loadCalendar]);

  const openDay = async (date: string): Promise<void> => {
    setSelectedDate(date);
    setOpenStayId(null);
    setDayLoading(true);
    try {
      setDayGuests(await fetchStaffReservationsOnDate(date, propertyId));
    } catch {
      setDayGuests([]);
    } finally {
      setDayLoading(false);
    }
  };

  const cells = buildMonthCells(month.year, month.month);
  const openStay = dayGuests.find((row): boolean => row.id === openStayId) ?? null;
  const label = new Date(month.year, month.month - 1, 1).toLocaleString('en-GB', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <Box>
      <Stack spacing={2} sx={{ mb: 3 }}>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <CalendarMonthOutlinedIcon color="primary" />
          <Typography variant="h4" component="h1">
            Who is staying
          </Typography>
        </Stack>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap" useFlexGap>
          <Button
            variant="outlined"
            onClick={(): void => {
              const prev =
                month.month === 1 ? monthBounds(month.year - 1, 12) : monthBounds(month.year, month.month - 1);
              setMonth(prev);
            }}
          >
            Previous
          </Button>
          <Typography>{label}</Typography>
          <Button
            variant="outlined"
            onClick={(): void => {
              const next =
                month.month === 12 ? monthBounds(month.year + 1, 1) : monthBounds(month.year, month.month + 1);
              setMonth(next);
            }}
          >
            Next
          </Button>
          <FormControl sx={{ minWidth: 260 }}>
            <InputLabel id="property-filter">Property</InputLabel>
            <Select
              labelId="property-filter"
              label="Property"
              value={propertyId === '' ? ALL_PROPERTIES : propertyId}
              onChange={(event): void => {
                const next = event.target.value;
                setPropertyId(next === ALL_PROPERTIES ? '' : next);
                setSelectedDate(null);
                setDayGuests([]);
                setOpenStayId(null);
              }}
            >
              <MenuItem value={ALL_PROPERTIES}>All properties</MenuItem>
              {properties.map((property): React.JSX.Element => (
                <MenuItem key={property.id} value={property.id}>
                  {property.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Stack>
      </Stack>
      <Typography color="text.secondary" sx={{ mb: 1 }}>
        Click a day to list who is in-house. Booked, rebooked, cancelled, and unpaid holds are split by colour.
      </Typography>
      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        <Chip size="small" label="Booked" sx={{ bgcolor: 'success.light', color: 'success.dark' }} />
        <Chip size="small" label="Rebook" sx={{ bgcolor: 'info.light', color: 'info.dark' }} />
        <Chip size="small" label="Hold" sx={{ bgcolor: 'warning.light', color: 'warning.dark' }} />
        <Chip size="small" label="Cancelled" sx={{ bgcolor: 'error.light', color: 'error.dark' }} />
      </Stack>
      {error !== null ? <Alert severity="error">{error}</Alert> : null}
      {loading ? (
        <CircularProgress />
      ) : (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 1,
          }}
        >
          {WEEKDAYS.map((day): React.JSX.Element => (
            <Typography key={day} variant="caption" color="text.secondary">
              {day}
            </Typography>
          ))}
          {cells.map((cell, index): React.JSX.Element => {
            if (cell === null) {
              return <Box key={`empty-${index}`} />;
            }
            const day = occupancy.get(cell);
            const selected = cell === selectedDate;
            return (
              <Box
                key={cell}
                component="button"
                type="button"
                aria-pressed={selected}
                onClick={(): void => {
                  void openDay(cell);
                }}
                sx={{
                  minHeight: 104,
                  p: 1,
                  textAlign: 'left',
                  border: 1,
                  borderColor: selected ? 'primary.main' : 'divider',
                  borderRadius: 1,
                  bgcolor: selected ? 'action.selected' : dayCellBg(day),
                  cursor: 'pointer',
                  color: 'text.primary',
                }}
              >
                <Typography variant="body2">{Number.parseInt(cell.slice(8), 10)}</Typography>
                <DayLaneLabels day={day} />
              </Box>
            );
          })}
        </Box>
      )}
      <Box sx={{ mt: 4, border: 1, borderColor: 'divider', borderRadius: 1, p: { xs: 2, md: 3 } }}>
        {selectedDate === null ? (
          <Typography color="text.secondary">Select a day to see who is in-house.</Typography>
        ) : (
          <>
            <Typography variant="h5" component="h2" gutterBottom>
              Stays on {selectedDate}
            </Typography>
            {dayLoading ? (
              <CircularProgress />
            ) : dayGuests.length === 0 ? (
              <Typography color="text.secondary">No stays on this date.</Typography>
            ) : (
              <>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Guest</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>House</TableCell>
                    <TableCell>Property</TableCell>
                    <TableCell>Dates</TableCell>
                    <TableCell>Guests</TableCell>
                    <TableCell>Total</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {dayGuests.map((row): React.JSX.Element => (
                    <TableRow
                      key={row.id}
                      hover
                      selected={row.id === openStayId}
                      sx={{ cursor: 'pointer' }}
                      onClick={(): void => {
                        setOpenStayId(row.id);
                      }}
                    >
                      <TableCell>
                        <Typography>{row.bookerName}</Typography>
                        <Typography variant="caption" color="text.secondary" display="block">
                          {row.bookerEmail}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip size="small" color={stayChipColor(row)} label={stayChipLabel(row)} />
                      </TableCell>
                      <TableCell>{row.houseName}</TableCell>
                      <TableCell>{row.propertyName}</TableCell>
                      <TableCell>
                        {row.checkIn} → {row.checkOut}
                      </TableCell>
                      <TableCell>{row.guestCount}</TableCell>
                      <TableCell>{formatCents(row.totalCents, row.currencyCode)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <StayDetailDialog
                stay={openStay}
                onClose={(): void => {
                  setOpenStayId(null);
                }}
              />
              </>
            )}
          </>
        )}
      </Box>
    </Box>
  );
}

interface DayLaneLabelsProps {
  day: CalendarDayOccupancy | undefined;
}

function DayLaneLabels({ day }: DayLaneLabelsProps): React.JSX.Element {
  if (day === undefined || !dayHasActivity(day)) {
    return (
      <Typography variant="caption" color="text.secondary">
        Open
      </Typography>
    );
  }
  return (
    <Stack spacing={0.25}>
      {day.bookingCount > 0 ? (
        <Typography variant="caption" sx={{ color: 'success.dark' }}>
          {day.bookingCount} booked
        </Typography>
      ) : null}
      {day.rebookCount > 0 ? (
        <Typography variant="caption" sx={{ color: 'info.dark' }}>
          {day.rebookCount} rebook
        </Typography>
      ) : null}
      {day.pendingCount > 0 ? (
        <Typography variant="caption" sx={{ color: 'warning.dark' }}>
          {day.pendingCount} hold
        </Typography>
      ) : null}
      {day.cancelledCount > 0 ? (
        <Typography variant="caption" sx={{ color: 'error.dark' }}>
          {day.cancelledCount} cancelled
        </Typography>
      ) : null}
    </Stack>
  );
}

function dayHasActivity(day: CalendarDayOccupancy): boolean {
  return day.bookingCount + day.rebookCount + day.cancelledCount + day.pendingCount > 0;
}

function dayCellBg(day: CalendarDayOccupancy | undefined): string {
  if (day === undefined || !dayHasActivity(day)) {
    return 'background.paper';
  }
  if (day.bookingCount > 0) {
    return 'success.light';
  }
  if (day.pendingCount > 0) {
    return 'warning.light';
  }
  if (day.rebookCount > 0) {
    return 'info.light';
  }
  return 'error.light';
}

function stayChipLabel(stay: StaffReservation): string {
  if (stay.rebookOfId !== null && stay.status !== 'cancelled' && stay.status !== 'released') {
    return 'Rebook';
  }
  if (stay.status === 'confirmed') {
    return 'Booked';
  }
  if (stay.status === 'active') {
    return 'Hold';
  }
  if (stay.status === 'cancelled') {
    return 'Cancelled';
  }
  if (stay.status === 'released') {
    return 'Released';
  }
  return stay.status;
}

function stayChipColor(stay: StaffReservation): 'success' | 'warning' | 'info' | 'error' | 'default' {
  if (stay.rebookOfId !== null && stay.status !== 'cancelled' && stay.status !== 'released') {
    return 'info';
  }
  if (stay.status === 'confirmed') {
    return 'success';
  }
  if (stay.status === 'active') {
    return 'warning';
  }
  if (stay.status === 'cancelled' || stay.status === 'released') {
    return 'error';
  }
  return 'default';
}

function buildMonthCells(year: number, month: number): Array<string | null> {
  const first = new Date(year, month - 1, 1);
  const lastDate = new Date(year, month, 0).getDate();
  const mondayPad = (first.getDay() + 6) % 7;
  const cells: Array<string | null> = [];
  for (let i = 0; i < mondayPad; i += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= lastDate; day += 1) {
    cells.push(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  return cells;
}

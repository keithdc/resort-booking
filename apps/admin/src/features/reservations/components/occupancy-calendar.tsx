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
import { currentMonthBounds, localTodayIso, monthBounds, type MonthBounds } from '@/shared/utils/month-bounds';
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
  const [selectedDate, setSelectedDate] = useState<string>(() => localTodayIso());
  const [dayGuests, setDayGuests] = useState<StaffReservation[]>([]);
  const [dayLoading, setDayLoading] = useState(false);
  const [openStayId, setOpenStayId] = useState<string | null>(null);
  const todayIso = localTodayIso();

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

  const loadDay = useCallback(async (date: string): Promise<void> => {
    setDayLoading(true);
    try {
      setDayGuests(await fetchStaffReservationsOnDate(date, propertyId));
    } catch {
      setDayGuests([]);
    } finally {
      setDayLoading(false);
    }
  }, [propertyId]);

  useEffect((): void => {
    void loadDay(selectedDate);
  }, [loadDay, selectedDate]);

  const openDay = (date: string): void => {
    setSelectedDate(date);
    setOpenStayId(null);
  };

  const goToMonth = (next: MonthBounds): void => {
    setMonth(next);
    setSelectedDate(selectedDateInMonth(next, todayIso));
    setOpenStayId(null);
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
              goToMonth(prev);
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
              goToMonth(next);
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
        Click a day to list who is in-house. Today is selected when you open the page. Status colour is on the labels
        only.
      </Typography>
      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap sx={{ mb: 2 }}>
        <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600 }}>
          Booked
        </Typography>
        <Typography variant="caption" sx={{ color: 'info.main', fontWeight: 600 }}>
          Rebook
        </Typography>
        <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 600 }}>
          Hold
        </Typography>
        <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 600 }}>
          Cancelled
        </Typography>
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
            const isToday = cell === todayIso;
            return (
              <Box
                key={cell}
                component="button"
                type="button"
                aria-pressed={selected}
                aria-current={isToday ? 'date' : undefined}
                onClick={(): void => {
                  openDay(cell);
                }}
                sx={{
                  minHeight: 108,
                  p: 1,
                  textAlign: 'left',
                  border: 1,
                  borderColor: selected ? 'primary.main' : isToday ? 'primary.light' : 'divider',
                  borderRadius: 1,
                  bgcolor: selected ? 'action.selected' : 'background.paper',
                  cursor: 'pointer',
                  color: 'text.primary',
                }}
              >
                <Typography variant="body2" sx={{ fontWeight: isToday ? 700 : 400 }}>
                  {Number.parseInt(cell.slice(8), 10)}
                </Typography>
                <DayLaneLabels day={day} />
              </Box>
            );
          })}
        </Box>
      )}
      <Box sx={{ mt: 4, border: 1, borderColor: 'divider', borderRadius: 1, p: { xs: 2, md: 3 } }}>
        {selectedDate === '' ? (
          <Typography color="text.secondary">Select a day to see who is in-house.</Typography>
        ) : (
          <>
            <Typography variant="h5" component="h2" gutterBottom>
              Bookings on {selectedDate}
            </Typography>
            {dayLoading ? (
              <CircularProgress />
            ) : dayGuests.length === 0 ? (
              <Typography color="text.secondary">No bookings on this date.</Typography>
            ) : (
              <>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Guest</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Stay</TableCell>
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
                onUpdated={(updated): void => {
                  setDayGuests((rows): StaffReservation[] =>
                    rows.map((row): StaffReservation => (row.id === updated.id ? updated : row)),
                  );
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
    <Stack spacing={0.15}>
      {day.bookingCount > 0 ? (
        <Typography variant="caption" sx={{ color: 'success.main', fontWeight: 600, display: 'block' }}>
          {day.bookingCount} Booked
        </Typography>
      ) : null}
      {day.rebookCount > 0 ? (
        <Typography variant="caption" sx={{ color: 'info.main', fontWeight: 600, display: 'block' }}>
          {day.rebookCount} Rebook
        </Typography>
      ) : null}
      {day.pendingCount > 0 ? (
        <Typography variant="caption" sx={{ color: 'warning.main', fontWeight: 600, display: 'block' }}>
          {day.pendingCount} Hold
        </Typography>
      ) : null}
      {day.cancelledCount > 0 ? (
        <Typography variant="caption" sx={{ color: 'error.main', fontWeight: 600, display: 'block' }}>
          {day.cancelledCount} Cancelled
        </Typography>
      ) : null}
    </Stack>
  );
}

function dayHasActivity(day: CalendarDayOccupancy): boolean {
  return day.bookingCount + day.rebookCount + day.cancelledCount + day.pendingCount > 0;
}

function stayChipLabel(stay: StaffReservation): string {
  if (stay.rebookOfId !== null && stay.status !== 'cancelled' && stay.status !== 'released') {
    return 'Rebook';
  }
  if (stay.status === 'confirmed') {
    if (stay.arrivalStatus === 'checked_in') {
      return 'In-house';
    }
    if (stay.arrivalStatus === 'checked_out') {
      return 'Checked out';
    }
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
  if (stay.status === 'confirmed' && stay.arrivalStatus === 'checked_out') {
    return 'default';
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

function selectedDateInMonth(bounds: MonthBounds, today: string): string {
  if (today >= bounds.from && today < bounds.to) {
    return today;
  }
  return bounds.from;
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

/**
 * @file apps/admin/src/features/reservations/components/occupancy-calendar.tsx
 * @feature reservations
 * @dependencies staff calendar API — no occupancy math
 */

'use client';

import type { CalendarDayOccupancy, PropertySummary, StaffReservation } from '@resort-booking/shared-types';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import { Alert, Box, Skeleton } from '@mui/material';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/shared/components/page-header';
import { ApiRequestError } from '@/shared/services/api-client';
import { currentMonthBounds, localTodayIso, monthBounds, type MonthBounds } from '@/shared/utils/month-bounds';
import { fetchStaffCalendar, fetchStaffReservationsOnDate } from '../services/staff-reservations-api';
import { monthLabel, selectedDateInMonth } from '../utils/calendar-cells';
import { CalendarDayPanel } from './calendar-day-panel';
import { CalendarGrid } from './calendar-grid';
import { CalendarLegend } from './calendar-legend';
import { CalendarToolbar } from './calendar-toolbar';
import { StayDetailDialog } from './stay-detail-dialog';

interface OccupancyCalendarProps {
  properties: PropertySummary[];
}

/**
 * Full staff month calendar. Past days stay clickable. Day details sit under the grid; open a
 * booking card for the full stay.
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

  const openStay = dayGuests.find((row): boolean => row.id === openStayId) ?? null;
  const previousMonth = (): void =>
    goToMonth(month.month === 1 ? monthBounds(month.year - 1, 12) : monthBounds(month.year, month.month - 1));
  const nextMonth = (): void =>
    goToMonth(month.month === 12 ? monthBounds(month.year + 1, 1) : monthBounds(month.year, month.month + 1));
  const goToToday = (): void => {
    const current = currentMonthBounds(new Date());
    setMonth(current);
    setSelectedDate(todayIso);
    setOpenStayId(null);
  };

  return (
    <Box>
      <PageHeader
        icon={<CalendarMonthOutlinedIcon />}
        title="Who is staying"
        description="Click a day to see who is in-house. Open a booking for the full details, check-in and actions."
      />
      <CalendarToolbar
        label={monthLabel(month.year, month.month)}
        year={month.year}
        month={month.month}
        currentYear={new Date().getFullYear()}
        onSelectMonth={(year, nextMonthNumber): void => goToMonth(monthBounds(year, nextMonthNumber))}
        properties={properties}
        propertyId={propertyId}
        onPrevious={previousMonth}
        onNext={nextMonth}
        onToday={goToToday}
        onPropertyChange={(next): void => {
          setPropertyId(next);
          setOpenStayId(null);
        }}
      />
      <CalendarLegend />
      {error !== null ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
      {loading ? (
        <Skeleton variant="rounded" height={420} aria-label="Loading calendar" />
      ) : (
        <CalendarGrid
          year={month.year}
          month={month.month}
          occupancy={occupancy}
          selectedDate={selectedDate}
          todayIso={todayIso}
          onSelect={openDay}
        />
      )}
      <CalendarDayPanel date={selectedDate} guests={dayGuests} loading={dayLoading} openStayId={openStayId} onOpen={setOpenStayId} />
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
        onChanged={(): void => {
          // A cancellation or date change moves counts and rows: reload both.
          void loadCalendar();
          void loadDay(selectedDate);
        }}
      />
    </Box>
  );
}

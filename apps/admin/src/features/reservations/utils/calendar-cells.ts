/**
 * @file apps/admin/src/features/reservations/utils/calendar-cells.ts
 * @feature reservations
 * @dependencies month-bounds
 *
 * Layout helpers for the month grid (display only; the counts come from the API).
 */

import type { CalendarDayOccupancy } from '@resort-booking/shared-types';
import type { MonthBounds } from '@/shared/utils/month-bounds';

/**
 * The month as grid cells, Monday first: `null` pads before the 1st, then one ISO date per day.
 */
export function buildMonthCells(year: number, month: number): Array<string | null> {
  const first = new Date(year, month - 1, 1);
  const lastDate = new Date(year, month, 0).getDate();
  const mondayPad = (first.getDay() + 6) % 7;
  const cells: Array<string | null> = [];
  for (let i = 0; i < mondayPad; i += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= lastDate; day += 1) {
    cells.push(`${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
  }
  return cells;
}

/**
 * Which day to select after changing month: today when it is in that month, else the 1st.
 */
export function selectedDateInMonth(bounds: MonthBounds, today: string): string {
  if (today >= bounds.from && today < bounds.to) {
    return today;
  }
  return bounds.from;
}

/**
 * True when anything at all happens on the day (booked, rebooked, held or cancelled).
 */
export function dayHasActivity(day: CalendarDayOccupancy): boolean {
  return day.bookingCount + day.rebookCount + day.cancelledCount + day.pendingCount > 0;
}

/**
 * Saturday or Sunday, for the weekend shading.
 */
export function isWeekendIso(isoDate: string): boolean {
  const weekday = new Date(`${isoDate}T00:00:00Z`).getUTCDay();
  return weekday === 0 || weekday === 6;
}

/**
 * "Wednesday 25 November 2026" for the day panel heading.
 */
export function longDateLabel(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
    .format(date)
    .replace(',', '');
}

/**
 * "November 2026" for the toolbar.
 */
export function monthLabel(year: number, month: number): string {
  return new Date(year, month - 1, 1).toLocaleString('en-GB', { month: 'long', year: 'numeric' });
}

/**
 * The twelve month names, January first, for the month picker.
 */
export function monthNames(): string[] {
  return Array.from({ length: 12 }, (_value, index): string => new Date(2000, index, 1).toLocaleString('en-GB', { month: 'long' }));
}

/**
 * Years offered by the year picker: three back and three ahead of this year, widened to include the
 * year being shown (e.g. after jumping with the arrows).
 */
export function yearOptions(shownYear: number, currentYear: number): number[] {
  const first = Math.min(shownYear, currentYear - 3);
  const last = Math.max(shownYear, currentYear + 3);
  return Array.from({ length: last - first + 1 }, (_value, index): number => first + index);
}

export type DayTone = 'success' | 'warning' | 'info' | 'error' | 'none';

/**
 * The colour a busy day is edged with: unpaid holds first (they need action), then bookings,
 * rebooks, and finally cancellations. "none" for a quiet day.
 */
export function dominantTone(day: CalendarDayOccupancy | undefined): DayTone {
  if (day === undefined) {
    return 'none';
  }
  if (day.pendingCount > 0) {
    return 'warning';
  }
  if (day.bookingCount > 0) {
    return 'success';
  }
  if (day.rebookCount > 0) {
    return 'info';
  }
  if (day.cancelledCount > 0) {
    return 'error';
  }
  return 'none';
}

/**
 * Screen-reader name for a day button: "25 November 2026, 2 booked, 1 hold" or "..., open".
 */
export function dayAriaLabel(isoDate: string, day: CalendarDayOccupancy | undefined): string {
  const parts: string[] = [];
  if (day !== undefined) {
    if (day.bookingCount > 0) {
      parts.push(`${String(day.bookingCount)} booked`);
    }
    if (day.rebookCount > 0) {
      parts.push(`${String(day.rebookCount)} rebooked`);
    }
    if (day.pendingCount > 0) {
      parts.push(`${String(day.pendingCount)} on hold`);
    }
    if (day.cancelledCount > 0) {
      parts.push(`${String(day.cancelledCount)} cancelled`);
    }
  }
  const date = new Date(`${isoDate}T00:00:00Z`);
  const label = Number.isNaN(date.getTime())
    ? isoDate
    : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date);
  return `${label}, ${parts.length === 0 ? 'open' : parts.join(', ')}`;
}

export interface DayLane {
  tone: 'success' | 'info' | 'warning' | 'error';
  icon: 'booked' | 'rebook' | 'hold' | 'cancelled';
  count: number;
  /** Short word shown on the grid and read out ("Booked"). */
  label: string;
}

/**
 * The non-empty status lanes of a day in display order (booked, rebook, hold, cancelled). Shared by the
 * full cell and the compact phone cell so both show the same numbers.
 */
export function dayLanes(day: CalendarDayOccupancy | undefined): DayLane[] {
  if (day === undefined) {
    return [];
  }
  const lanes: DayLane[] = [
    { tone: 'success', icon: 'booked', count: day.bookingCount, label: 'Booked' },
    { tone: 'info', icon: 'rebook', count: day.rebookCount, label: 'Rebook' },
    { tone: 'warning', icon: 'hold', count: day.pendingCount, label: 'Hold' },
    { tone: 'error', icon: 'cancelled', count: day.cancelledCount, label: 'Cancelled' },
  ];
  return lanes.filter((lane): boolean => lane.count > 0);
}

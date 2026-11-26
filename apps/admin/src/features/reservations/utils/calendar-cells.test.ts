/**
 * @file apps/admin/src/features/reservations/utils/calendar-cells.test.ts
 * @feature reservations
 */

import { describe, expect, it } from 'vitest';
import { monthBounds } from '@/shared/utils/month-bounds';
import { buildMonthCells, dayAriaLabel, dayHasActivity, dayLanes, dominantTone, isWeekendIso, longDateLabel, monthLabel, monthNames, selectedDateInMonth, yearOptions } from './calendar-cells';

describe('buildMonthCells', () => {
  it('pads to Monday and lists every day (November 2026 starts on a Sunday)', () => {
    const cells = buildMonthCells(2026, 11);

    expect(cells.slice(0, 7)).toEqual([null, null, null, null, null, null, '2026-11-01']);
    expect(cells.filter((cell) => cell !== null)).toHaveLength(30);
    expect(cells[cells.length - 1]).toBe('2026-11-30');
  });

  it('needs no padding when the 1st is a Monday (June 2026)', () => {
    expect(buildMonthCells(2026, 6)[0]).toBe('2026-06-01');
  });

  it('knows leap years', () => {
    expect(buildMonthCells(2028, 2).filter((cell) => cell !== null)).toHaveLength(29);
    expect(buildMonthCells(2027, 2).filter((cell) => cell !== null)).toHaveLength(28);
  });
});

describe('selectedDateInMonth', () => {
  it('keeps today when it is inside the month, else the first day', () => {
    const november = monthBounds(2026, 11);
    expect(selectedDateInMonth(november, '2026-11-25')).toBe('2026-11-25');
    expect(selectedDateInMonth(november, '2026-12-01')).toBe('2026-11-01');
    expect(selectedDateInMonth(november, '2026-10-31')).toBe('2026-11-01');
  });
});

describe('dayHasActivity', () => {
  const quiet = { date: '2026-11-01', bookingCount: 0, rebookCount: 0, cancelledCount: 0, pendingCount: 0 };

  it('is false for a quiet day and true when anything happens', () => {
    expect(dayHasActivity(quiet)).toBe(false);
    expect(dayHasActivity({ ...quiet, pendingCount: 1 })).toBe(true);
    expect(dayHasActivity({ ...quiet, cancelledCount: 2 })).toBe(true);
  });
});

describe('isWeekendIso', () => {
  it('flags Saturday and Sunday only', () => {
    expect(isWeekendIso('2026-11-28')).toBe(true);
    expect(isWeekendIso('2026-11-29')).toBe(true);
    expect(isWeekendIso('2026-11-30')).toBe(false);
    expect(isWeekendIso('2026-11-27')).toBe(false);
  });
});

describe('labels', () => {
  it('writes the long date and the month', () => {
    expect(longDateLabel('2026-11-25')).toBe('Wednesday 25 November 2026');
    expect(longDateLabel('nonsense')).toBe('nonsense');
    expect(monthLabel(2026, 11)).toBe('November 2026');
  });
});

describe('dominantTone', () => {
  const quiet = { date: '2026-11-01', bookingCount: 0, rebookCount: 0, cancelledCount: 0, pendingCount: 0 };

  it('puts unpaid holds first, then bookings, rebooks and cancellations', () => {
    expect(dominantTone(undefined)).toBe('none');
    expect(dominantTone(quiet)).toBe('none');
    expect(dominantTone({ ...quiet, cancelledCount: 1 })).toBe('error');
    expect(dominantTone({ ...quiet, cancelledCount: 1, rebookCount: 1 })).toBe('info');
    expect(dominantTone({ ...quiet, cancelledCount: 1, rebookCount: 1, bookingCount: 2 })).toBe('success');
    expect(dominantTone({ ...quiet, bookingCount: 2, pendingCount: 1 })).toBe('warning');
  });
});

describe('dayAriaLabel', () => {
  const quiet = { date: '2026-11-25', bookingCount: 0, rebookCount: 0, cancelledCount: 0, pendingCount: 0 };

  it('says open for a quiet or unknown day', () => {
    expect(dayAriaLabel('2026-11-25', undefined)).toBe('25 November 2026, open');
    expect(dayAriaLabel('2026-11-25', quiet)).toBe('25 November 2026, open');
  });

  it('lists every kind of activity in words', () => {
    expect(dayAriaLabel('2026-11-25', { ...quiet, bookingCount: 2, pendingCount: 1, cancelledCount: 1, rebookCount: 1 })).toBe(
      '25 November 2026, 2 booked, 1 rebooked, 1 on hold, 1 cancelled',
    );
  });
});

describe('monthNames and yearOptions', () => {
  it('lists the twelve months, January first', () => {
    const names = monthNames();
    expect(names).toHaveLength(12);
    expect(names[0]).toBe('January');
    expect(names[11]).toBe('December');
  });

  it('offers three years back and three ahead of this year', () => {
    expect(yearOptions(2026, 2026)).toEqual([2023, 2024, 2025, 2026, 2027, 2028, 2029]);
  });

  it('widens to the year being shown when it is outside that window', () => {
    expect(yearOptions(2035, 2026)).toEqual([2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035]);
    expect(yearOptions(2015, 2026)).toContain(2015);
    expect(yearOptions(2015, 2026)[0]).toBe(2015);
  });
});

describe('dayLanes', () => {
  it('lists only the busy lanes in display order', () => {
    const day = { date: '2026-11-25', bookingCount: 2, rebookCount: 0, cancelledCount: 1, pendingCount: 3 };
    expect(dayLanes(day).map((lane) => `${lane.label}:${String(lane.count)}`)).toEqual(['Booked:2', 'Hold:3', 'Cancelled:1']);
  });

  it('is empty for a quiet or unknown day', () => {
    expect(dayLanes(undefined)).toEqual([]);
    expect(dayLanes({ date: '2026-11-25', bookingCount: 0, rebookCount: 0, cancelledCount: 0, pendingCount: 0 })).toEqual([]);
  });
});

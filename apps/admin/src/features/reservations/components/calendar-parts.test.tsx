// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/reservations/components/calendar-parts.test.tsx
 * @feature reservations
 */

import type { CalendarDayOccupancy, PropertySummary } from '@resort-booking/shared-types';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { staffReservation } from '@/test/fixtures';
import { CalendarCompactCell } from './calendar-compact-cell';
import { CalendarDayCell } from './calendar-day-cell';
import { CalendarDayPanel } from './calendar-day-panel';
import { CalendarGrid } from './calendar-grid';
import { CalendarLegend } from './calendar-legend';
import { CalendarToolbar } from './calendar-toolbar';
import { DayBookingCard } from './day-booking-card';

const BUSY: CalendarDayOccupancy = { date: '2026-11-25', bookingCount: 2, rebookCount: 1, cancelledCount: 1, pendingCount: 1 };
const PROPERTIES = [{ id: 'p1', name: 'Alpine Lake' }] as PropertySummary[];

describe('CalendarToolbar', () => {
  afterEach(cleanup);

  function renderToolbar(): Record<'onPrevious' | 'onNext' | 'onToday' | 'onPropertyChange' | 'onSelectMonth', ReturnType<typeof vi.fn>> {
    const handlers = { onPrevious: vi.fn(), onNext: vi.fn(), onToday: vi.fn(), onPropertyChange: vi.fn(), onSelectMonth: vi.fn() };
    render(<CalendarToolbar label="November 2026" year={2026} month={11} currentYear={2026} properties={PROPERTIES} propertyId="" {...handlers} />);
    return handlers;
  }

  it('shows the month and moves back, forward and to today', () => {
    const handlers = renderToolbar();

    expect(screen.getByRole('heading', { name: 'November 2026' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));

    expect(handlers.onPrevious).toHaveBeenCalledTimes(1);
    expect(handlers.onNext).toHaveBeenCalledTimes(1);
    expect(handlers.onToday).toHaveBeenCalledTimes(1);
  });

  it('jumps straight to another month or year', () => {
    const handlers = renderToolbar();

    expect(screen.getByRole('combobox', { name: 'Month' }).textContent).toBe('November');
    expect(screen.getByRole('combobox', { name: 'Year' }).textContent).toBe('2026');

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Month' }));
    fireEvent.click(screen.getByRole('option', { name: 'March' }));
    expect(handlers.onSelectMonth).toHaveBeenLastCalledWith(2026, 3);

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Year' }));
    fireEvent.click(screen.getByRole('option', { name: '2028' }));
    expect(handlers.onSelectMonth).toHaveBeenLastCalledWith(2028, 11);
  });

  it('filters by property, with "" meaning all', () => {
    const handlers = renderToolbar();

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Property' }));
    fireEvent.click(screen.getByRole('option', { name: 'Alpine Lake' }));

    expect(handlers.onPropertyChange).toHaveBeenCalledWith('p1');
  });
});

describe('CalendarLegend', () => {
  afterEach(cleanup);

  it('names every status and the two day markers', () => {
    render(<CalendarLegend />);

    const legend = within(screen.getByRole('list', { name: 'Legend' }));
    for (const word of ['Booked', 'Rebook', 'Hold (unpaid)', 'Cancelled', 'Today', 'Weekend']) {
      expect(legend.getByText(word)).toBeTruthy();
    }
  });
});

describe('CalendarDayCell', () => {
  afterEach(cleanup);

  it('shows each kind of activity with its count and word, and names the day for screen readers', () => {
    render(<CalendarDayCell date="2026-11-25" day={BUSY} selected={false} today={false} weekend={false} onSelect={vi.fn()} />);

    const cell = screen.getByRole('button', { name: '25 November 2026, 2 booked, 1 rebooked, 1 on hold, 1 cancelled' });
    for (const text of ['2 Booked', '1 Rebook', '1 Hold', '1 Cancelled']) {
      expect(within(cell).getByText(text)).toBeTruthy();
    }
  });

  it('says Open on a quiet day', () => {
    render(<CalendarDayCell date="2026-11-26" day={undefined} selected={false} today={false} weekend={false} onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: '26 November 2026, open' }).textContent).toContain('Open');
  });

  it('marks today with aria-current, the selected day as pressed, and selects on click', () => {
    const onSelect = vi.fn();
    render(<CalendarDayCell date="2026-11-25" day={BUSY} selected today weekend={false} onSelect={onSelect} />);

    const cell = screen.getByRole('button');
    expect(cell.getAttribute('aria-current')).toBe('date');
    expect(cell.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(cell);
    expect(onSelect).toHaveBeenCalledWith('2026-11-25');
  });

  it('is not marked as today or selected otherwise', () => {
    render(<CalendarDayCell date="2026-11-28" day={undefined} selected={false} today={false} weekend onSelect={vi.fn()} />);

    const cell = screen.getByRole('button');
    expect(cell.getAttribute('aria-current')).toBeNull();
    expect(cell.getAttribute('aria-pressed')).toBe('false');
  });
});

describe('CalendarGrid', () => {
  afterEach(cleanup);

  it('shows every day of the month under Monday-first weekday headings and passes the clicked date up', () => {
    const onSelect = vi.fn();
    render(
      <CalendarGrid
        year={2026}
        month={11}
        occupancy={new Map([[BUSY.date, BUSY]])}
        selectedDate="2026-11-25"
        todayIso="2026-11-25"
        onSelect={onSelect}
      />,
    );

    expect(screen.getAllByRole('button')).toHaveLength(30);
    expect(screen.getByText('Mon')).toBeTruthy();
    expect(screen.getByText('Sun')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^3 November 2026/ }));
    expect(onSelect).toHaveBeenCalledWith('2026-11-03');
    expect(screen.getByRole('button', { name: /^25 November 2026/ }).getAttribute('aria-current')).toBe('date');
  });
});

describe('DayBookingCard', () => {
  afterEach(cleanup);

  it('shows who, where, dates, nights, guests, total and status, and opens on click', () => {
    const onOpen = vi.fn();
    render(
      <DayBookingCard
        stay={staffReservation({ id: 'r9', bookerName: 'Ada Lovelace', guestCount: 3, checkIn: '2027-07-10', checkOut: '2027-07-12', totalCents: 96000 })}
        selected={false}
        onOpen={onOpen}
      />,
    );

    const card = screen.getByRole('button', { name: 'Open booking of Ada Lovelace' });
    const text = (card.textContent ?? '').replace(/\s/g, ' ');
    expect(text).toContain('Ada Lovelace');
    expect(text).toContain('Lake Chalet');
    expect(text).toContain('2 nights');
    expect(text).toContain('3 guests');
    expect(text).toContain('960,00 €');
    expect(text).toContain('Booked');
    expect(text).toContain('10 Jul → 12 Jul');
    expect(text).toContain('AL');
    fireEvent.click(card);
    expect(onOpen).toHaveBeenCalledWith('r9');
  });

  it('keeps the dense one-line details and puts the full dates in the tooltip', () => {
    render(<DayBookingCard stay={staffReservation({ checkIn: '2027-07-10', checkOut: '2027-07-12' })} selected={false} onOpen={vi.fn()} />);

    const card = screen.getByRole('button');
    expect(card.getAttribute('title')).toContain('10 Jul 2027 → 12 Jul 2027');
    expect(card.getAttribute('title')).toContain('Lake Chalet');
    expect(card.getAttribute('title')).toContain('2 nights');
  });

  it('says 1 night and 1 guest in the singular', () => {
    render(<DayBookingCard stay={staffReservation({ guestCount: 1, checkIn: '2027-07-10', checkOut: '2027-07-11' })} selected onOpen={vi.fn()} />);

    const text = screen.getByRole('button').textContent ?? '';
    expect(text).toContain('1 night');
    expect(text).not.toContain('1 nights');
    expect(text).toContain('1 guest');
    expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('true');
  });

  it('shows a cancelled booking as cancelled', () => {
    render(<DayBookingCard stay={staffReservation({ status: 'cancelled' })} selected={false} onOpen={vi.fn()} />);

    expect(screen.getByRole('button').textContent).toContain('Cancelled');
  });
});

describe('CalendarDayPanel', () => {
  afterEach(cleanup);

  it('titles the panel with the date and lists a card per booking', () => {
    render(
      <CalendarDayPanel
        date="2026-11-25"
        guests={[staffReservation({ id: 'a', bookerName: 'Ada Lovelace' }), staffReservation({ id: 'b', bookerName: 'Grace Hopper' })]}
        loading={false}
        openStayId={null}
        onOpen={vi.fn()}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Bookings on 2026-11-25' })).toBeTruthy();
    expect(screen.getByText(/Wednesday 25 November 2026 · 2 bookings/)).toBeTruthy();
    expect(within(screen.getByRole('list', { name: 'Bookings on this day' })).getAllByRole('listitem')).toHaveLength(2);
  });

  it('says 1 booking in the singular', () => {
    render(<CalendarDayPanel date="2026-11-25" guests={[staffReservation()]} loading={false} openStayId={null} onOpen={vi.fn()} />);

    expect(screen.getByText(/· 1 booking$/)).toBeTruthy();
  });

  it('shows a helpful empty state with no bookings', () => {
    render(<CalendarDayPanel date="2026-11-25" guests={[]} loading={false} openStayId={null} onOpen={vi.fn()} />);

    expect(screen.getByText('No bookings on this date')).toBeTruthy();
    expect(screen.getByText(/Pick another day/)).toBeTruthy();
  });

  it('shows placeholders while loading, not an empty state', () => {
    render(<CalendarDayPanel date="2026-11-25" guests={[]} loading openStayId={null} onOpen={vi.fn()} />);

    expect(screen.getByLabelText('Loading bookings')).toBeTruthy();
    expect(screen.queryByText('No bookings on this date')).toBeNull();
  });

  it('opens a booking from its card', () => {
    const onOpen = vi.fn();
    render(<CalendarDayPanel date="2026-11-25" guests={[staffReservation({ id: 'a', bookerName: 'Ada Lovelace' })]} loading={false} openStayId={null} onOpen={onOpen} />);

    fireEvent.click(screen.getByRole('button', { name: 'Open booking of Ada Lovelace' }));

    expect(onOpen).toHaveBeenCalledWith('a');
  });
});

describe('CalendarCompactCell and the compact grid', () => {
  afterEach(cleanup);

  it('shows icon + count per status, keeps the full description for screen readers, and selects on tap', () => {
    const onSelect = vi.fn();
    const { container } = render(
      <CalendarCompactCell date="2026-11-25" day={BUSY} selected={false} today={false} weekend={false} onSelect={onSelect} />,
    );

    const button = screen.getByRole('button', { name: '25 November 2026, 2 booked, 1 rebooked, 1 on hold, 1 cancelled' });
    expect(container.querySelectorAll('[data-lane]')).toHaveLength(4);
    expect(button.textContent).toBe('25' + '2' + '1' + '1' + '1');
    fireEvent.click(button);
    expect(onSelect).toHaveBeenCalledWith('2026-11-25');
  });

  it('marks today and the selected day', () => {
    render(<CalendarCompactCell date="2026-11-26" day={undefined} selected today weekend={false} onSelect={vi.fn()} />);

    const button = screen.getByRole('button', { name: '26 November 2026, open' });
    expect(button.getAttribute('aria-current')).toBe('date');
    expect(button.getAttribute('aria-pressed')).toBe('true');
  });

  it('renders every day of the month with compact cells when asked', () => {
    const occupancy = new Map<string, CalendarDayOccupancy>([[BUSY.date, BUSY]]);
    const { container } = render(
      <CalendarGrid year={2026} month={11} occupancy={occupancy} selectedDate="2026-11-25" todayIso="2026-11-26" onSelect={vi.fn()} compact />,
    );

    expect(screen.getAllByRole('button')).toHaveLength(30);
    expect(container.querySelectorAll('[data-lane]')).toHaveLength(4);
  });
});

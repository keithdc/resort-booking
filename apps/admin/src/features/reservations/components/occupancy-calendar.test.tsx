// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/reservations/components/occupancy-calendar.test.tsx
 * @feature reservations
 */

import type { PropertySummary, StaffCalendar, StaffReservation } from '@resort-booking/shared-types';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/shared/services/api-client';
import { currentMonthBounds, localTodayIso } from '@/shared/utils/month-bounds';
import { staffReservation } from '@/test/fixtures';
import { OccupancyCalendar } from './occupancy-calendar';

const api = vi.hoisted(() => ({
  fetchStaffCalendar: vi.fn<(from: string, to: string, propertyId: string) => Promise<StaffCalendar>>(),
  fetchStaffReservationsOnDate: vi.fn<(date: string, propertyId: string) => Promise<StaffReservation[]>>(),
}));

vi.mock('../services/staff-reservations-api', () => api);
vi.mock('./stay-detail-dialog', () => ({
  StayDetailDialog: ({ stay }: { stay: StaffReservation | null }): React.JSX.Element | null =>
    stay === null ? null : <div role="dialog" aria-label="Booking detail">{stay.bookerName}</div>,
}));

const PROPERTIES = [{ id: 'p1', name: 'Alpine Lake' }] as PropertySummary[];
const today = currentMonthBounds(new Date());

describe('OccupancyCalendar', () => {
  beforeEach(() => {
    api.fetchStaffCalendar.mockReset();
    api.fetchStaffReservationsOnDate.mockReset();
    api.fetchStaffCalendar.mockResolvedValue({ from: today.from, to: today.to, days: [] });
    api.fetchStaffReservationsOnDate.mockResolvedValue([]);
  });
  afterEach(cleanup);

  it('shows the page header, toolbar, legend, month grid and day panel for today', async () => {
    render(<OccupancyCalendar properties={PROPERTIES} />);

    expect(screen.getByRole('heading', { level: 1, name: 'Who is staying' })).toBeTruthy();
    expect(await screen.findByRole('list', { name: 'Legend' })).toBeTruthy();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^\d+ \w+ \d{4}, / }).length).toBeGreaterThan(27));
    expect(api.fetchStaffCalendar).toHaveBeenCalledWith(today.from, today.to, '');
    expect(api.fetchStaffReservationsOnDate).toHaveBeenCalledWith(localTodayIso(), '');
    expect(await screen.findByText('No bookings on this date')).toBeTruthy();
  });

  it('lists the day\'s bookings and opens one', async () => {
    api.fetchStaffReservationsOnDate.mockResolvedValue([staffReservation({ id: 'a', bookerName: 'Ada Lovelace' })]);
    render(<OccupancyCalendar properties={PROPERTIES} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Open booking of Ada Lovelace' }));

    expect(screen.getByRole('dialog', { name: 'Booking detail' }).textContent).toBe('Ada Lovelace');
  });

  it('goes to the next and previous month and loads that month', async () => {
    render(<OccupancyCalendar properties={PROPERTIES} />);
    await screen.findByRole('list', { name: 'Legend' });

    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    await waitFor(() => expect(api.fetchStaffCalendar).toHaveBeenCalledTimes(2));
    expect(api.fetchStaffCalendar.mock.calls[1]?.[0]).toBe(today.to);

    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    await waitFor(() => expect(api.fetchStaffCalendar).toHaveBeenCalledTimes(3));
    expect(api.fetchStaffCalendar.mock.calls[2]?.[0]).toBe(today.from);
  });

  it('jumps back to this month and selects today', async () => {
    render(<OccupancyCalendar properties={PROPERTIES} />);
    await screen.findByRole('list', { name: 'Legend' });
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    await waitFor(() => expect(api.fetchStaffCalendar).toHaveBeenCalledTimes(2));

    fireEvent.click(screen.getByRole('button', { name: 'Today' }));

    await waitFor(() => expect(api.fetchStaffCalendar).toHaveBeenCalledTimes(3));
    expect(api.fetchStaffCalendar.mock.calls[2]?.[0]).toBe(today.from);
    expect(api.fetchStaffReservationsOnDate).toHaveBeenLastCalledWith(localTodayIso(), '');
  });

  it('loads the clicked day', async () => {
    render(<OccupancyCalendar properties={PROPERTIES} />);
    await screen.findByRole('list', { name: 'Legend' });
    const first = `${today.from.slice(0, 8)}01`;

    fireEvent.click(await screen.findByRole('button', { name: new RegExp(`^1 \\w+ ${first.slice(0, 4)}, `) }));

    await waitFor(() => expect(api.fetchStaffReservationsOnDate).toHaveBeenLastCalledWith(first, ''));
  });

  it('filters by property and reloads', async () => {
    render(<OccupancyCalendar properties={PROPERTIES} />);
    await screen.findByRole('list', { name: 'Legend' });

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Property' }));
    fireEvent.click(screen.getByRole('option', { name: 'Alpine Lake' }));

    await waitFor(() => expect(api.fetchStaffCalendar).toHaveBeenLastCalledWith(today.from, today.to, 'p1'));
  });

  it('shows the API message when the calendar cannot load, and still draws the month', async () => {
    api.fetchStaffCalendar.mockRejectedValue(new ApiRequestError('Staff authentication required', 401));
    render(<OccupancyCalendar properties={PROPERTIES} />);

    expect(await screen.findByText('Staff authentication required')).toBeTruthy();
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^\d+ \w+ \d{4}, open$/ }).length).toBeGreaterThan(27));
  });

  it('shows busy days with their counts', async () => {
    api.fetchStaffCalendar.mockResolvedValue({
      from: today.from,
      to: today.to,
      days: [{ date: localTodayIso(), bookingCount: 2, rebookCount: 0, cancelledCount: 0, pendingCount: 1 }],
    });
    render(<OccupancyCalendar properties={PROPERTIES} />);

    const day = await screen.findByRole('button', { name: new RegExp(`2 booked, 1 on hold$`) });
    expect(day.textContent).toContain('2 Booked');
    expect(day.textContent).toContain('1 Hold');
  });
});

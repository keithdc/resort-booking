// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/reporting/components/booking-sources-section.test.tsx
 * @feature reporting
 */

import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { staffReport } from '@/test/fixtures';
import { BookingSourcesSection } from './booking-sources-section';
import { MoneyVisibility } from './money-visibility';

const TWO = staffReport({
  bookingSources: [
    { source: 'website', reservationCount: 3, occupiedNights: 9, revenueCents: 96000, sharePercent: 75 },
    { source: 'airbnb', reservationCount: 1, occupiedNights: 1, revenueCents: 24000, sharePercent: 25 },
  ],
});

describe('BookingSourcesSection', () => {
  afterEach(cleanup);

  it('shows each source with bookings, nights, money and share, under a captioned heading', () => {
    render(<BookingSourcesSection report={TWO} />);

    expect(screen.getByRole('heading', { name: 'Where bookings come from' })).toBeTruthy();
    const list = screen.getByRole('list', { name: 'Bookings by source' });
    expect(within(list).getByText('Our website')).toBeTruthy();
    expect(within(list).getByText(/3 bookings · 9 nights · 960,00 € · 75%/)).toBeTruthy();
    expect(within(list).getByText('Airbnb')).toBeTruthy();
    expect(within(list).getByText(/1 booking · 1 night · 240,00 € · 25%/)).toBeTruthy();
  });

  it('shows one source simply, at 100 percent', () => {
    render(<BookingSourcesSection report={staffReport()} />);

    expect(within(screen.getByRole('list', { name: 'Bookings by source' })).getByText('Our website')).toBeTruthy();
    expect(screen.getByText(/3 bookings · 4 nights · 1.320,00 € · 100%/)).toBeTruthy();
  });

  it('says there is nothing yet when the period has no booking', () => {
    render(<BookingSourcesSection report={staffReport({ bookingSources: [], reservationCount: 0 })} />);

    expect(screen.queryByRole('list', { name: 'Bookings by source' })).toBeNull();
  });

  it('keeps the money from someone who does not see money, and keeps counts, nights and shares', () => {
    render(
      <MoneyVisibility hidden>
        <BookingSourcesSection report={TWO} />
      </MoneyVisibility>,
    );

    expect(screen.getByText(/3 bookings · 9 nights · 75%/)).toBeTruthy();
    expect(screen.queryByText(/960,00/)).toBeNull();
    expect(screen.queryByText(/240,00/)).toBeNull();
  });
});

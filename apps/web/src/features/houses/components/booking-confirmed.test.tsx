// @vitest-environment jsdom
/**
 * @file apps/web/src/features/houses/components/booking-confirmed.test.tsx
 * @feature houses
 */

import type { ReservationConfirmation } from '@resort-booking/shared-types';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BookingConfirmed } from './booking-confirmed';

const CONFIRMATION: ReservationConfirmation = {
  reservationId: 'r1',
  reference: 'BK-ABC123',
  houseId: 'house',
  propertyId: 'prop',
  checkIn: '2027-10-01',
  checkOut: '2027-10-09',
  guestCount: 2,
  totalCents: 95200,
  currencyCode: 'EUR',
  bookerName: 'Ada',
  bookerEmail: 'ada@example.com',
};

describe('BookingConfirmed', () => {
  afterEach(cleanup);

  it('shows the reference to quote, the stay and the amount paid', () => {
    render(<BookingConfirmed confirmation={CONFIRMATION} houseName="Spruce Studio" />);

    const text = (screen.getByLabelText('Booking confirmed').textContent ?? '').replace(/\s/g, ' ');
    expect(screen.getByText('BK-ABC123')).toBeTruthy();
    expect(text).toContain('Spruce Studio · 2027-10-01 to 2027-10-09 · 2 guests');
    expect(text).toContain('Total paid: 952,00 €');
  });

  it('links to the manage page with the reference filled in, never the email', () => {
    render(<BookingConfirmed confirmation={CONFIRMATION} houseName="Spruce Studio" />);

    const link = screen.getByRole('link', { name: 'Manage or cancel this booking' });
    expect(link.getAttribute('href')).toBe('/manage?reference=BK-ABC123');
    expect(link.getAttribute('href')).not.toContain('@');
  });

  it('says one guest in the singular', () => {
    render(<BookingConfirmed confirmation={{ ...CONFIRMATION, guestCount: 1 }} houseName="Spruce Studio" />);

    expect(screen.getByLabelText('Booking confirmed').textContent).toContain('1 guest');
    expect(screen.getByLabelText('Booking confirmed').textContent).not.toContain('1 guests');
  });
});

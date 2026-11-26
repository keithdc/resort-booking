// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/reservations/services/staff-reservations-api.test.tsx
 * @feature reservations
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { staffReservation } from '../../../test/fixtures';
import { StayDetailDialog } from '../components/stay-detail-dialog';
import type { RawStaffReservation } from '../utils/reservation-defaults';
import {
  cancelStaffReservation,
  changeStaffReservationDates,
  fetchStaffBookingExtras,
  fetchStaffReservationsOnDate,
  patchStaffReservationArrival,
  quoteStaffBooking,
} from './staff-reservations-api';

const client = vi.hoisted(() => ({
  getStaffApiOk: vi.fn<(path: string) => Promise<unknown>>(),
  mutateStaffApiOk: vi.fn<(path: string, method: string, body?: unknown) => Promise<unknown>>(),
}));

vi.mock('@/shared/services/api-client', () => client);

/** A reservation the way an API from before cancellations and refunds existed sends it. */
function oldApiReservation(): RawStaffReservation {
  const full = staffReservation({ status: 'cancelled' });
  return {
    id: full.id,
    organizationId: full.organizationId,
    propertyId: full.propertyId,
    propertyName: full.propertyName,
    houseId: full.houseId,
    houseName: full.houseName,
    checkIn: full.checkIn,
    checkOut: full.checkOut,
    guestCount: full.guestCount,
    bookerName: full.bookerName,
    bookerEmail: full.bookerEmail,
    bookerPhone: full.bookerPhone,
    guestNote: full.guestNote,
    paymentMethod: full.paymentMethod,
    status: full.status,
    kind: full.kind,
    arrivalStatus: full.arrivalStatus,
    rebookOfId: full.rebookOfId,
    totalCents: full.totalCents,
    currencyCode: full.currencyCode,
    requestNames: full.requestNames,
  };
}

describe('staff reservation requests from an API that may be older than this app', () => {
  beforeEach(() => {
    client.getStaffApiOk.mockReset();
    client.mutateStaffApiOk.mockReset();
  });

  afterEach(cleanup);

  it('fills the newer fields of every reservation in a day list', async () => {
    client.getStaffApiOk.mockResolvedValue([oldApiReservation(), oldApiReservation()]);

    const rows = await fetchStaffReservationsOnDate('2027-07-10', 'prop-1');

    expect(client.getStaffApiOk).toHaveBeenCalledWith('/staff/reservations?onDate=2027-07-10&propertyId=prop-1');
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.cancellation === null && row.refunds.length === 0 && row.changes.length === 0)).toBe(true);
  });

  it('fills them for a check-in or check-out update', async () => {
    client.mutateStaffApiOk.mockResolvedValue(oldApiReservation());

    const updated = await patchStaffReservationArrival('r1', 'checked_in');

    expect(updated.cancellation).toBeNull();
  });

  it('fills the reservation inside a cancel result and keeps the refund as sent', async () => {
    client.mutateStaffApiOk.mockResolvedValue({ reservation: oldApiReservation(), refund: null });

    const result = await cancelStaffReservation('r1', { reason: 'guest_request', refundCents: null, note: 'asked' });

    expect(result.reservation.refunds).toEqual([]);
    expect(result.refund).toBeNull();
  });

  it('fills the reservation inside a change-dates result', async () => {
    client.mutateStaffApiOk.mockResolvedValue({ reservation: oldApiReservation(), refund: null });

    const result = await changeStaffReservationDates('r1', {
      newCheckIn: '2027-07-20',
      newCheckOut: '2027-07-22',
      waiveFee: false,
      note: 'moved',
      balanceSettledOutside: false,
    });

    expect(result.reservation.changes).toEqual([]);
  });

  it('keeps a current API response exactly as it is', async () => {
    const current = staffReservation({ reference: 'BK-ABC1234567', paidCents: 18000 });
    client.getStaffApiOk.mockResolvedValue([current]);

    const rows = await fetchStaffReservationsOnDate('2027-07-10', '');

    expect(rows[0]).toEqual(current);
  });

  it('REGRESSION: a cancelled booking from an older API opens in the booking dialog instead of crashing', async () => {
    client.getStaffApiOk.mockResolvedValue([oldApiReservation()]);
    const [stay] = await fetchStaffReservationsOnDate('2027-07-10', '');

    render(<StayDetailDialog stay={stay ?? null} onClose={vi.fn<() => void>()} onUpdated={vi.fn()} onChanged={vi.fn()} />);

    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByText('Cancelled')).toBeTruthy();
  });
});

describe('booking extras requests', () => {
  beforeEach(() => {
    client.getStaffApiOk.mockReset();
    client.mutateStaffApiOk.mockReset();
  });

  it('reads the extras a property offers from the staff route that employees may call', async () => {
    client.getStaffApiOk.mockResolvedValue([{ id: 'x1' }]);

    await expect(fetchStaffBookingExtras('p 1')).resolves.toEqual([{ id: 'x1' }]);

    expect(client.getStaffApiOk).toHaveBeenCalledWith('/staff/properties/p%201/booking-extras');
  });

  it('sends the chosen extras with the quote', async () => {
    client.mutateStaffApiOk.mockResolvedValue({ totalCents: 1 });
    const body = { houseId: 'h1', checkIn: '2027-07-10', checkOut: '2027-07-12', guestCount: 2, extras: [{ extraId: 'x1', quantity: 2 }] };

    await quoteStaffBooking(body);

    expect(client.mutateStaffApiOk).toHaveBeenCalledWith('/staff/reservations/quote', 'POST', body);
  });
});

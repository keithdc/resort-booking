/**
 * @file apps/admin/src/features/reservations/utils/stay-actions.test.ts
 * @feature reservations
 */

import { describe, expect, it } from 'vitest';
import { staffRefund, staffReservation } from '@/test/fixtures';
import { canCancelStay, canChangeStayDates, cancelNotice, changeNotice } from './stay-actions';

const plain = (text: string): string => text.replace(/\s/g, ' ');

describe('canCancelStay', () => {
  it('allows a confirmed reservation', () => {
    expect(canCancelStay(staffReservation())).toBe(true);
  });

  it.each([
    ['a cancelled booking', { status: 'cancelled' as const }],
    ['a hold', { kind: 'hold' as const, status: 'active' as const }],
    ['an expired hold', { kind: 'hold' as const, status: 'expired' as const }],
    ['a released hold', { status: 'released' as const }],
  ])('refuses %s', (_name, overrides) => {
    expect(canCancelStay(staffReservation(overrides))).toBe(false);
  });
});

describe('canChangeStayDates', () => {
  const today = '2027-07-01';

  it('allows a confirmed booking that has not started', () => {
    expect(canChangeStayDates(staffReservation({ checkIn: '2027-07-10' }), today)).toBe(true);
  });

  it('allows a check-in today', () => {
    expect(canChangeStayDates(staffReservation({ checkIn: today }), today)).toBe(true);
  });

  it('refuses a check-in in the past, a guest already in the house, and a checked-out guest', () => {
    expect(canChangeStayDates(staffReservation({ checkIn: '2027-06-30' }), today)).toBe(false);
    expect(canChangeStayDates(staffReservation({ arrivalStatus: 'checked_in' }), today)).toBe(false);
    expect(canChangeStayDates(staffReservation({ arrivalStatus: 'checked_out' }), today)).toBe(false);
  });

  it('refuses a cancelled booking or a hold', () => {
    expect(canChangeStayDates(staffReservation({ status: 'cancelled' }), today)).toBe(false);
    expect(canChangeStayDates(staffReservation({ kind: 'hold', status: 'active' }), today)).toBe(false);
  });
});

describe('cancelNotice', () => {
  it('says the refund that was recorded', () => {
    const notice = plain(
      cancelNotice({ reservation: staffReservation(), refund: staffRefund({ amountCents: 12000, status: 'succeeded', provider: 'mock' }) }),
    );

    expect(notice).toBe('Booking cancelled, refund of 120,00 € recorded');
  });

  it('says there is no refund when none was recorded or it is zero', () => {
    expect(cancelNotice({ reservation: staffReservation(), refund: null })).toBe('Booking cancelled, no refund recorded');
    expect(cancelNotice({ reservation: staffReservation(), refund: staffRefund({ amountCents: 0 }) })).toBe('Booking cancelled, no refund recorded');
  });

  it('points to the Refunds page when the refund must be sent by hand', () => {
    const notice = cancelNotice({ reservation: staffReservation(), refund: staffRefund({ provider: 'manual', status: 'pending' }) });

    expect(notice).toContain('must be sent by hand, see Refunds');
  });

  it('does not send staff to the Refunds page for a refund the provider already handled', () => {
    const notice = cancelNotice({ reservation: staffReservation(), refund: staffRefund({ provider: 'mock', status: 'succeeded' }) });

    expect(notice).not.toContain('by hand');
  });
});

describe('changeNotice', () => {
  const next = staffReservation({ reference: 'BK-NEW0000000' });

  it('gives the new reference', () => {
    expect(changeNotice({ reservation: next, refund: null })).toBe('Dates changed. The new booking is BK-NEW0000000');
  });

  it('mentions a refund of the difference', () => {
    const notice = plain(changeNotice({ reservation: next, refund: staffRefund({ amountCents: 12000, provider: 'mock', status: 'succeeded' }) }));

    expect(notice).toBe('Dates changed. The new booking is BK-NEW0000000, refund of 120,00 € recorded');
  });

  it('points to Refunds when that refund must be sent by hand', () => {
    const notice = changeNotice({ reservation: next, refund: staffRefund({ provider: 'manual', status: 'pending' }) });

    expect(notice).toContain('must be sent by hand, see Refunds');
  });

  it('ignores a zero refund', () => {
    expect(changeNotice({ reservation: next, refund: staffRefund({ amountCents: 0 }) })).toBe('Dates changed. The new booking is BK-NEW0000000');
  });
});

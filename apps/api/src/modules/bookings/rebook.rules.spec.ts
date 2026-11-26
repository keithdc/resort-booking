/**
 * @file apps/api/src/modules/bookings/rebook.rules.spec.ts
 * @feature bookings
 * @dependencies rebook.rules
 */

import {
  checkNewDates,
  checkRebookAllowed,
  parseRebookPayload,
  rebookBalance,
  rebookFeeCents,
} from './rebook.rules';

describe('rebookFeeCents', () => {
  it('is nothing when there is no fee', () => {
    expect(rebookFeeCents('none', 50, 96000)).toBe(0);
    expect(rebookFeeCents('none', 0, 96000)).toBe(0);
  });

  it('turns a fixed fee in euros into cents', () => {
    expect(rebookFeeCents('fixed', 20, 96000)).toBe(2000);
    expect(rebookFeeCents('fixed', 12.5, 96000)).toBe(1250);
  });

  it('takes a percentage of what has been paid, rounded to whole cents', () => {
    expect(rebookFeeCents('percent', 10, 96000)).toBe(9600);
    expect(rebookFeeCents('percent', 10, 33333)).toBe(3333);
    expect(rebookFeeCents('percent', 15, 10001)).toBe(1500);
  });

  it('ignores a fee value of zero or less, whatever the type', () => {
    expect(rebookFeeCents('fixed', 0, 96000)).toBe(0);
    expect(rebookFeeCents('percent', 0, 96000)).toBe(0);
    expect(rebookFeeCents('fixed', -5, 96000)).toBe(0);
    expect(rebookFeeCents('percent', Number.NaN, 96000)).toBe(0);
  });

  it('never takes more than everything that was paid as a percent fee', () => {
    expect(rebookFeeCents('percent', 250, 10000)).toBe(10000);
  });

  it('has no percent fee on nothing paid', () => {
    expect(rebookFeeCents('percent', 10, 0)).toBe(0);
    expect(rebookFeeCents('percent', 10, -100)).toBe(0);
  });
});

describe('rebookBalance', () => {
  it('asks for the difference when the new stay costs more', () => {
    expect(rebookBalance(120000, 0, 96000)).toEqual({ balanceCents: 24000, payCents: 24000, refundCents: 0 });
  });

  it('gives the difference back when the new stay costs less', () => {
    expect(rebookBalance(60000, 0, 96000)).toEqual({ balanceCents: -36000, payCents: 0, refundCents: 36000 });
  });

  it('moves nothing when the totals match and there is no fee', () => {
    expect(rebookBalance(96000, 0, 96000)).toEqual({ balanceCents: 0, payCents: 0, refundCents: 0 });
  });

  it('charges only the fee when the stay costs the same', () => {
    expect(rebookBalance(96000, 2000, 96000)).toEqual({ balanceCents: 2000, payCents: 2000, refundCents: 0 });
  });

  it('takes the fee out of a refund', () => {
    expect(rebookBalance(60000, 2000, 96000)).toEqual({ balanceCents: -34000, payCents: 0, refundCents: 34000 });
  });

  it('lets the fee swallow a small saving, so the guest pays a little', () => {
    expect(rebookBalance(95000, 2000, 96000)).toEqual({ balanceCents: 1000, payCents: 1000, refundCents: 0 });
  });

  it('leaves the booking holding exactly newTotal + fee in every case', () => {
    const cases: Array<[number, number, number]> = [[120000, 0, 96000], [60000, 2000, 96000], [96000, 0, 96000], [96000, 2000, 96000]];
    for (const [newTotal, fee, paid] of cases) {
      const balance = rebookBalance(newTotal, fee, paid);
      expect(paid + balance.payCents - balance.refundCents).toBe(newTotal + fee);
    }
  });
});

describe('checkRebookAllowed', () => {
  const TODAY = '2027-06-01';

  it('allows a confirmed booking whose policy allows changes and has not started', () => {
    expect(checkRebookAllowed(true, 'confirmed', '2027-07-10', TODAY)).toEqual({ allowed: true });
  });

  it('allows it on the check-in day itself, like cancelling', () => {
    expect(checkRebookAllowed(true, 'confirmed', TODAY, TODAY)).toEqual({ allowed: true });
  });

  it('refuses a booking nothing was paid for (pay at hotel), with a message for the guest or for staff', () => {
    expect(checkRebookAllowed(true, 'confirmed', '2027-07-10', TODAY, 'pending')).toMatchObject({
      allowed: false,
      code: 'PAYMENT_PENDING',
      message: expect.stringContaining('contact the property') as string,
    });
    expect(checkRebookAllowed(true, 'confirmed', '2027-07-10', TODAY, 'pending', 'staff')).toMatchObject({
      allowed: false,
      code: 'PAYMENT_PENDING',
      message: expect.stringContaining('Mark it as paid first') as string,
    });
  });

  it('refuses a booking with a priced extra, with a message for the guest or for staff, but only when the policy would allow it', () => {
    expect(checkRebookAllowed(true, 'confirmed', '2027-07-10', TODAY, 'paid', 'guest', true)).toMatchObject({
      allowed: false,
      code: 'EXTRAS_ON_BOOKING',
      message: expect.stringContaining('contact the property') as string,
    });
    expect(checkRebookAllowed(true, 'confirmed', '2027-07-10', TODAY, 'paid', 'staff', true)).toMatchObject({
      allowed: false,
      code: 'EXTRAS_ON_BOOKING',
      message: expect.stringContaining('Cancel it and make a new booking') as string,
    });
    // The policy's own "no" is still what a guest is told when dates cannot be changed at all.
    expect(checkRebookAllowed(false, 'confirmed', '2027-07-10', TODAY, 'paid', 'guest', true)).toMatchObject({ code: 'REBOOK_NOT_ALLOWED' });
    expect(checkRebookAllowed(true, 'confirmed', '2027-07-10', TODAY, 'paid', 'guest', false)).toEqual({ allowed: true });
  });

  it('allows a pay-at-hotel booking once it is marked paid', () => {
    expect(checkRebookAllowed(true, 'confirmed', '2027-07-10', TODAY, 'paid')).toEqual({ allowed: true });
  });

  it('refuses once the check-in date has passed', () => {
    expect(checkRebookAllowed(true, 'confirmed', '2027-05-31', TODAY)).toMatchObject({
      allowed: false,
      code: 'BOOKING_ALREADY_STARTED',
      message: 'This booking has already started. Please contact the property.',
    });
  });

  it('refuses when the policy saved with the booking says dates cannot be changed', () => {
    expect(checkRebookAllowed(false, 'confirmed', '2027-07-10', TODAY)).toMatchObject({
      allowed: false,
      code: 'REBOOK_NOT_ALLOWED',
      message: 'The dates of this booking cannot be changed. To change them, cancel and book again.',
    });
  });

  it('refuses a cancelled booking before anything else', () => {
    expect(checkRebookAllowed(true, 'cancelled', '2027-07-10', TODAY)).toMatchObject({ allowed: false, code: 'BOOKING_CANCELLED' });
    expect(checkRebookAllowed(false, 'cancelled', '2027-05-01', TODAY)).toMatchObject({ allowed: false, code: 'BOOKING_CANCELLED' });
  });

  it('prefers "not allowed by policy" over "already started" so the message is the real reason', () => {
    expect(checkRebookAllowed(false, 'confirmed', '2027-05-01', TODAY)).toMatchObject({ code: 'REBOOK_NOT_ALLOWED' });
  });

  it('refuses a check-in date it cannot read', () => {
    expect(checkRebookAllowed(true, 'confirmed', 'soon', TODAY)).toMatchObject({ allowed: false, code: 'BOOKING_ALREADY_STARTED' });
  });
});

describe('checkNewDates', () => {
  const current = { checkIn: '2027-07-10', checkOut: '2027-07-13' };
  const TODAY = '2027-06-01';

  it('accepts a different range in the future', () => {
    expect(checkNewDates(current, { checkIn: '2027-08-01', checkOut: '2027-08-04' }, TODAY)).toBe('ok');
  });

  it('accepts a one-night stay', () => {
    expect(checkNewDates(current, { checkIn: '2027-08-01', checkOut: '2027-08-02' }, TODAY)).toBe('ok');
  });

  it('accepts a range that overlaps the current dates (shifted by a day)', () => {
    expect(checkNewDates(current, { checkIn: '2027-07-11', checkOut: '2027-07-14' }, TODAY)).toBe('ok');
  });

  it('accepts a check-in today', () => {
    expect(checkNewDates(current, { checkIn: TODAY, checkOut: '2027-06-03' }, TODAY)).toBe('ok');
  });

  it('refuses the same dates', () => {
    expect(checkNewDates(current, current, TODAY)).toBe('same');
  });

  it('does not call it "same" when only one end moves', () => {
    expect(checkNewDates(current, { checkIn: '2027-07-10', checkOut: '2027-07-14' }, TODAY)).toBe('ok');
    expect(checkNewDates(current, { checkIn: '2027-07-09', checkOut: '2027-07-13' }, TODAY)).toBe('ok');
  });

  it('refuses a check-in in the past', () => {
    expect(checkNewDates(current, { checkIn: '2027-05-31', checkOut: '2027-06-03' }, TODAY)).toBe('past');
  });

  it.each([
    ['same-day', { checkIn: '2027-08-01', checkOut: '2027-08-01' }],
    ['inverted', { checkIn: '2027-08-05', checkOut: '2027-08-01' }],
    ['impossible', { checkIn: '2027-02-30', checkOut: '2027-03-02' }],
    ['unreadable', { checkIn: 'soon', checkOut: 'later' }],
  ])('refuses a %s range as invalid', (_name, next) => {
    expect(checkNewDates(current, next, TODAY)).toBe('invalid');
  });

  it('calls a past inverted range invalid, not past', () => {
    expect(checkNewDates(current, { checkIn: '2027-05-05', checkOut: '2027-05-01' }, TODAY)).toBe('invalid');
  });
});

describe('parseRebookPayload', () => {
  const SNAPSHOT = {
    lines: [],
    subtotalCents: 60000,
    discounts: [],
    discountCents: 0,
    totalCents: 60000,
    currencyCode: 'EUR',
    promoCode: null,
  };
  const GOOD = {
    oldBookingId: 'old',
    newCheckIn: '2027-08-01',
    newCheckOut: '2027-08-04',
    newTotalCents: 60000,
    feeCents: 2000,
    priceSnapshot: SNAPSHOT,
  };

  it('reads a complete payload', () => {
    expect(parseRebookPayload(GOOD)).toEqual(GOOD);
  });

  it.each([null, undefined, 'x', 7, [], {}, { ...GOOD, oldBookingId: 1 }, { ...GOOD, newTotalCents: '60000' }, { ...GOOD, priceSnapshot: { lines: [] } }])(
    'refuses a damaged payload %j, so it can never apply a change',
    (raw) => {
      expect(parseRebookPayload(raw)).toBeNull();
    },
  );

  it('drops unknown fields instead of carrying them', () => {
    expect(parseRebookPayload({ ...GOOD, sneaky: true })).toEqual(GOOD);
  });
});

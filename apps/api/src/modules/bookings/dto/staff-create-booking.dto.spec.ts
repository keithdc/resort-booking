/**
 * @file apps/api/src/modules/bookings/dto/staff-create-booking.dto.spec.ts
 * @feature bookings
 * Through the app's REAL ValidationPipe: what a staff-made booking accepts and refuses.
 */

import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { CreateHoldDto } from '../../inventory/dto/create-hold.dto';
import { apiValidationPipeOptions } from '../../../shared/validation/validation-exception.factory';
import { StaffBookingQuoteDto, StaffCreateBookingDto } from './staff-create-booking.dto';

const pipe = new ValidationPipe(apiValidationPipeOptions());

async function run<T extends object>(type: new () => T, payload: object): Promise<T | Error> {
  try {
    return (await pipe.transform(payload, { type: 'body', metatype: type })) as T;
  } catch (error: unknown) {
    return error as Error;
  }
}

const accepted = (result: unknown): boolean => !(result instanceof Error);

const BODY = {
  houseId: '33333333-3333-3333-3333-333333333331',
  checkIn: '2027-07-10',
  checkOut: '2027-07-12',
  guestCount: 2,
  paymentMethod: 'pay_at_hotel',
  bookingSource: 'phone_email',
  bookerName: 'Ada Lovelace',
  bookerEmail: 'ada@example.com',
  bookerPhone: '+33612345678',
  guestNote: 'Late arrival',
};

describe('StaffCreateBookingDto', () => {
  it('accepts a full body, and one without a phone or a note (they default to empty)', async () => {
    expect(accepted(await run(StaffCreateBookingDto, BODY))).toBe(true);
    const minimal: Record<string, unknown> = { ...BODY };
    delete minimal.bookerPhone;
    delete minimal.guestNote;
    const result = await run(StaffCreateBookingDto, minimal);
    expect(result).toMatchObject({ bookerPhone: '', guestNote: '' });
    expect(accepted(await run(StaffCreateBookingDto, { ...BODY, bookerPhone: '' }))).toBe(true);
  });

  it('trims the text it keeps', async () => {
    const result = await run(StaffCreateBookingDto, { ...BODY, bookerName: '  Ada  ', bookerEmail: ' ada@example.com ', guestNote: ' hi ' });
    expect(result).toMatchObject({ bookerName: 'Ada', bookerEmail: 'ada@example.com', guestNote: 'hi' });
  });

  it('accepts pay at hotel and paid by channel, never the guest methods or other text', async () => {
    for (const value of ['card', 'bank_transfer', '', 'PAY_AT_HOTEL', null, 5, {}, [], undefined]) {
      expect(accepted(await run(StaffCreateBookingDto, { ...BODY, paymentMethod: value }))).toBe(false);
    }
    expect(accepted(await run(StaffCreateBookingDto, { ...BODY, paymentMethod: 'paid_by_channel', bookingSource: 'airbnb', channelTotalCents: 120000 }))).toBe(true);
  });

  it('needs a source, and only one of the six', async () => {
    for (const source of ['website', 'airbnb', 'booking_com', 'other_site', 'phone_email', 'walk_in']) {
      expect(accepted(await run(StaffCreateBookingDto, { ...BODY, bookingSource: source }))).toBe(true);
    }
    for (const value of ['', 'Airbnb', 'expedia', null, 5, {}, [], undefined]) {
      expect(accepted(await run(StaffCreateBookingDto, { ...BODY, bookingSource: value }))).toBe(false);
    }
  });

  it('takes the total typed for a channel booking as whole cents from 1 up to the ceiling, null or absent otherwise', async () => {
    expect(await run(StaffCreateBookingDto, BODY)).toMatchObject({ channelTotalCents: null });
    expect(accepted(await run(StaffCreateBookingDto, { ...BODY, channelTotalCents: null }))).toBe(true);
    const channel = { ...BODY, paymentMethod: 'paid_by_channel', bookingSource: 'airbnb' };
    for (const value of [1, 120000, 100_000_000]) {
      expect(accepted(await run(StaffCreateBookingDto, { ...channel, channelTotalCents: value }))).toBe(true);
    }
    for (const value of [0, -5, 1.5, 100_000_001, '120000', true, {}, []]) {
      expect(accepted(await run(StaffCreateBookingDto, { ...channel, channelTotalCents: value }))).toBe(false);
    }
  });

  it('refuses a missing or blank name, a bad email and a bad phone', async () => {
    expect(accepted(await run(StaffCreateBookingDto, { ...BODY, bookerName: '   ' }))).toBe(false);
    expect(accepted(await run(StaffCreateBookingDto, { ...BODY, bookerName: 'x'.repeat(121) }))).toBe(false);
    expect(accepted(await run(StaffCreateBookingDto, { ...BODY, bookerEmail: 'not-an-email' }))).toBe(false);
    expect(accepted(await run(StaffCreateBookingDto, { ...BODY, bookerEmail: `${'a'.repeat(250)}@example.com` }))).toBe(false);
    expect(accepted(await run(StaffCreateBookingDto, { ...BODY, bookerPhone: '0612' }))).toBe(false);
    expect(accepted(await run(StaffCreateBookingDto, { ...BODY, bookerPhone: 5 }))).toBe(false);
  });

  it('bounds the note and refuses wrong types for every text field instead of converting them', async () => {
    expect(accepted(await run(StaffCreateBookingDto, { ...BODY, guestNote: 'x'.repeat(2001) }))).toBe(false);
    for (const field of ['bookerName', 'bookerEmail', 'guestNote', 'checkIn', 'checkOut', 'houseId']) {
      for (const value of [{}, [], ['a'], 5, true]) {
        expect(accepted(await run(StaffCreateBookingDto, { ...BODY, [field]: value }))).toBe(false);
      }
    }
  });

  it('refuses text, null and out-of-range numbers for guests, and malformed dates and ids', async () => {
    for (const value of ['2', '', null, 0, 51, 1.5, [], {}]) {
      expect(accepted(await run(StaffCreateBookingDto, { ...BODY, guestCount: value }))).toBe(false);
    }
    for (const value of ['2027-7-1', '10/07/2027', '2027-07-10T00:00', '']) {
      expect(accepted(await run(StaffCreateBookingDto, { ...BODY, checkIn: value }))).toBe(false);
    }
    expect(accepted(await run(StaffCreateBookingDto, { ...BODY, houseId: 'not-an-id' }))).toBe(false);
  });

  it('refuses fields it does not know, so nobody can set the money fields from the request', async () => {
    for (const extra of [{ paymentStatus: 'paid' }, { paidCents: 96000 }, { totalCents: 1 }, { termsAccepted: true }, { organizationId: 'x' }, { createdByStaffId: 'x' }]) {
      expect(accepted(await run(StaffCreateBookingDto, { ...BODY, ...extra }))).toBe(false);
    }
  });
});

describe('StaffBookingQuoteDto', () => {
  it('needs the stay, the dates and the party size, and nothing else', async () => {
    const { houseId, checkIn, checkOut, guestCount } = BODY;
    expect(accepted(await run(StaffBookingQuoteDto, { houseId, checkIn, checkOut, guestCount }))).toBe(true);
    expect(accepted(await run(StaffBookingQuoteDto, { houseId, checkIn, checkOut }))).toBe(false);
    expect(accepted(await run(StaffBookingQuoteDto, { houseId, checkIn, checkOut, guestCount, other: 'X' }))).toBe(false);
  });

  it('takes an optional promo code, up to 40 characters, text only', async () => {
    const { houseId, checkIn, checkOut, guestCount } = BODY;
    expect(accepted(await run(StaffBookingQuoteDto, { houseId, checkIn, checkOut, guestCount, promoCode: 'SUMMER10' }))).toBe(true);
    expect(accepted(await run(StaffBookingQuoteDto, { houseId, checkIn, checkOut, guestCount, promoCode: 'X'.repeat(41) }))).toBe(false);
    expect(accepted(await run(StaffBookingQuoteDto, { houseId, checkIn, checkOut, guestCount, promoCode: 5 }))).toBe(false);
  });
});

describe('extras on a staff booking', () => {
  const EXTRA_ID = '44444444-4444-4444-4444-444444444441';
  const ONE = { extraId: EXTRA_ID, quantity: 2 };

  it('accepts none, an empty list, and a short list of ids with quantities, on the quote and on the booking', async () => {
    const { houseId, checkIn, checkOut, guestCount } = BODY;
    const quoteBody = { houseId, checkIn, checkOut, guestCount };
    const list = [ONE, { extraId: '44444444-4444-4444-4444-444444444442', quantity: 1 }];
    expect(accepted(await run(StaffBookingQuoteDto, { ...quoteBody, extras: [] }))).toBe(true);
    expect(accepted(await run(StaffBookingQuoteDto, { ...quoteBody, extras: list }))).toBe(true);
    expect(accepted(await run(StaffCreateBookingDto, { ...BODY, extras: [] }))).toBe(true);
    expect(accepted(await run(StaffCreateBookingDto, { ...BODY, extras: list }))).toBe(true);
    expect(accepted(await run(StaffCreateBookingDto, BODY))).toBe(true);
  });

  it('keeps extras as a typed list of objects', async () => {
    const result = await run(StaffCreateBookingDto, { ...BODY, extras: [ONE] });
    expect(result).toMatchObject({ extras: [{ extraId: EXTRA_ID, quantity: 2 }] });
  });

  it('refuses a quantity that is not a whole number from 1 to 20, whatever its type', async () => {
    for (const quantity of [0, -1, 21, 1.5, '2', null, undefined, {}, [], NaN]) {
      expect(accepted(await run(StaffCreateBookingDto, { ...BODY, extras: [{ extraId: EXTRA_ID, quantity }] }))).toBe(false);
    }
    for (const quantity of [1, 20]) {
      expect(accepted(await run(StaffCreateBookingDto, { ...BODY, extras: [{ extraId: EXTRA_ID, quantity }] }))).toBe(true);
    }
  });

  it('refuses an id that is not an id, and a missing id', async () => {
    for (const extraId of ['not-an-id', '', 5, null, undefined, {}]) {
      expect(accepted(await run(StaffCreateBookingDto, { ...BODY, extras: [{ extraId, quantity: 1 }] }))).toBe(false);
    }
  });

  it('refuses more than 10 extras, a list that is not a list, items that are not objects, and unknown fields on an item', async () => {
    const many = Array.from({ length: 11 }, (_unused, index) => ({ extraId: `44444444-4444-4444-4444-4444444444${String(index).padStart(2, '0')}`, quantity: 1 }));
    expect(accepted(await run(StaffCreateBookingDto, { ...BODY, extras: many }))).toBe(false);
    expect(accepted(await run(StaffCreateBookingDto, { ...BODY, extras: many.slice(0, 10) }))).toBe(true);
    for (const extras of ['x', 5, {}, ['x'], [null], [5]]) {
      expect(accepted(await run(StaffCreateBookingDto, { ...BODY, extras }))).toBe(false);
    }
    // Nobody can set a price, a name or a status from the request: those come from the property's own list.
    for (const field of [{ priceCents: 1 }, { name: 'Free' }, { status: 'confirmed' }, { lineCents: 0 }]) {
      expect(accepted(await run(StaffCreateBookingDto, { ...BODY, extras: [{ ...ONE, ...field }] }))).toBe(false);
    }
  });
});

describe('the public hold form', () => {
  it('never accepts pay at hotel, paid by channel or a source: a guest cannot pick them', async () => {
    const own: Record<string, unknown> = { ...BODY };
    delete own.bookingSource;
    const hold = { ...own, termsAccepted: true };
    expect(accepted(await run(CreateHoldDto, { ...hold, paymentMethod: 'card' }))).toBe(true);
    expect(accepted(await run(CreateHoldDto, hold))).toBe(false);
    expect(accepted(await run(CreateHoldDto, { ...hold, paymentMethod: 'paid_by_channel' }))).toBe(false);
    // The source is not a field of the public form at all: an unknown field is refused, so it cannot be smuggled in.
    expect(accepted(await run(CreateHoldDto, { ...hold, paymentMethod: 'card', bookingSource: 'airbnb' }))).toBe(false);
    expect(accepted(await run(CreateHoldDto, { ...hold, paymentMethod: 'card', channelTotalCents: 100 }))).toBe(false);
  });
});

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

  it('only accepts pay at hotel for now (a card link is a later step), never the guest methods or other text', async () => {
    for (const value of ['card', 'bank_transfer', '', 'PAY_AT_HOTEL', null, 5, {}, [], undefined]) {
      expect(accepted(await run(StaffCreateBookingDto, { ...BODY, paymentMethod: value }))).toBe(false);
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
    expect(accepted(await run(StaffBookingQuoteDto, { houseId, checkIn, checkOut, guestCount, promoCode: 'X' }))).toBe(false);
  });
});

describe('the public hold form', () => {
  it('never accepts pay at hotel: a guest cannot pick it', async () => {
    const hold = { ...BODY, termsAccepted: true };
    expect(accepted(await run(CreateHoldDto, { ...hold, paymentMethod: 'card' }))).toBe(true);
    expect(accepted(await run(CreateHoldDto, hold))).toBe(false);
  });
});

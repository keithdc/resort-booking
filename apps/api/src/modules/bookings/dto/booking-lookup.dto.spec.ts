/**
 * @file apps/api/src/modules/bookings/dto/booking-lookup.dto.spec.ts
 * @feature bookings
 */

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BookingLookupDto } from './booking-lookup.dto';

async function failed(payload: object): Promise<string[]> {
  return (await validate(plainToInstance(BookingLookupDto, payload))).map((error) => error.property);
}

describe('BookingLookupDto', () => {
  it('accepts a reference and a valid email', async () => {
    expect(await failed({ reference: 'BK-1A2B3C4D5E', email: 'ada@example.com' })).toEqual([]);
  });

  it('accepts a reference written loosely, since the service tidies it', async () => {
    expect(await failed({ reference: '  bk 1a2b 3c4d 5e ', email: 'ada@example.com' })).toEqual([]);
  });

  it.each(['plain', 'a@b', 'a@@example.com', '', ' ', 'x'.repeat(250) + '@example.com'])('rejects the email %j', async (email) => {
    expect(await failed({ reference: 'BK-1A2B3C4D5E', email })).toContain('email');
  });

  it.each([{}, { reference: '' }, { reference: 'x'.repeat(41) }, { reference: 123 }, { reference: null }])('rejects the reference in %j', async (payload) => {
    expect(await failed({ ...payload, email: 'ada@example.com' })).toContain('reference');
  });

  it('rejects a missing body', async () => {
    expect((await failed({})).sort()).toEqual(['email', 'reference']);
  });
});

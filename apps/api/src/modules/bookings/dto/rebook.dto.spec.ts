/**
 * @file apps/api/src/modules/bookings/dto/rebook.dto.spec.ts
 * @feature bookings
 */

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RebookDto } from './rebook.dto';

const GOOD = { reference: 'BK-1A2B3C4D5E', email: 'ada@example.com', newCheckIn: '2027-08-01', newCheckOut: '2027-08-04' };

// Same conversion setting as the app's global ValidationPipe (main.ts).
async function failed(payload: object): Promise<string[]> {
  const errors = await validate(plainToInstance(RebookDto, payload, { enableImplicitConversion: true }));
  return errors.map((error) => error.property);
}

describe('RebookDto', () => {
  it('accepts a booking and two dates', async () => {
    expect(await failed(GOOD)).toEqual([]);
  });

  it.each(['', 'soon', '01/08/2027', '2027-8-1', '2027-08-01T10:00:00Z', 20270801, null])('rejects the new check-in %j', async (newCheckIn) => {
    expect(await failed({ ...GOOD, newCheckIn })).toContain('newCheckIn');
  });

  it.each(['', 'later', '04-08-2027', undefined])('rejects the new check-out %j', async (newCheckOut) => {
    expect(await failed({ ...GOOD, newCheckOut })).toContain('newCheckOut');
  });

  it('still needs the booking reference and a valid email, like lookup', async () => {
    expect(await failed({ ...GOOD, reference: '' })).toContain('reference');
    expect(await failed({ ...GOOD, email: 'nope' })).toContain('email');
  });

  it('needs both dates', async () => {
    expect(await failed({ reference: GOOD.reference, email: GOOD.email })).toEqual(expect.arrayContaining(['newCheckIn', 'newCheckOut']));
  });
});

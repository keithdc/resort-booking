/**
 * @file apps/api/src/modules/bookings/dto/staff-actions.dto.spec.ts
 * @feature bookings
 */

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MarkRefundPaidDto, StaffCancelDto, StaffChangeDatesDto, StaffChangeQuoteDto } from './staff-actions.dto';
import { StaffRefundsQueryDto } from './staff-refunds-query.dto';

// Same conversion setting as the app's global ValidationPipe (main.ts).
async function failed<T extends object>(type: new () => T, payload: object): Promise<string[]> {
  const errors = await validate(plainToInstance(type, payload));
  return errors.map((error) => error.property);
}

describe('StaffCancelDto', () => {
  const GOOD = { reason: 'goodwill', refundCents: 1000, note: 'Kind gesture' };

  it('accepts each reason', async () => {
    for (const reason of ['guest_request', 'property_cancelled', 'goodwill']) {
      expect(await failed(StaffCancelDto, { ...GOOD, reason })).toEqual([]);
    }
  });

  it('treats refundCents as optional', async () => {
    expect(await failed(StaffCancelDto, { reason: 'guest_request', note: 'abc' })).toEqual([]);
    expect(await failed(StaffCancelDto, { reason: 'guest_request', refundCents: null, note: 'abc' })).toEqual([]);
  });

  it.each(['dates_changed', 'other', '', null])('rejects the reason %j', async (reason) => {
    expect(await failed(StaffCancelDto, { ...GOOD, reason })).toContain('reason');
  });

  it.each([-1, 1.5, '1000', 'abc', true])('rejects the refund amount %j (no loose conversion)', async (refundCents) => {
    expect(await failed(StaffCancelDto, { ...GOOD, refundCents })).toContain('refundCents');
  });

  it.each(['', '  ', 'ab', '  a  ', 'x'.repeat(501), 123, null, undefined])('rejects the note %j', async (note) => {
    expect(await failed(StaffCancelDto, { ...GOOD, note })).toContain('note');
  });

  it('counts the note after trimming: 3 and 500 characters pass', async () => {
    expect(await failed(StaffCancelDto, { ...GOOD, note: '  abc  ' })).toEqual([]);
    expect(await failed(StaffCancelDto, { ...GOOD, note: 'x'.repeat(500) })).toEqual([]);
  });
});

describe('StaffChangeQuoteDto / StaffChangeDatesDto', () => {
  const QUOTE = { newCheckIn: '2027-08-01', newCheckOut: '2027-08-04', waiveFee: false };
  const CHANGE = { ...QUOTE, note: 'Guest called', balanceSettledOutside: false };

  it('accepts good input', async () => {
    expect(await failed(StaffChangeQuoteDto, QUOTE)).toEqual([]);
    expect(await failed(StaffChangeDatesDto, CHANGE)).toEqual([]);
  });

  it.each(['', 'soon', '01/08/2027', 20270801, null])('rejects the date %j', async (newCheckIn) => {
    expect(await failed(StaffChangeQuoteDto, { ...QUOTE, newCheckIn })).toContain('newCheckIn');
  });

  it.each(['yes', 'false', 'true', 1, 0, null, undefined])('rejects waiveFee %j: only a real boolean counts', async (waiveFee) => {
    expect(await failed(StaffChangeQuoteDto, { ...QUOTE, waiveFee })).toContain('waiveFee');
  });

  it.each(['yes', 'true', 1, null, undefined])('rejects balanceSettledOutside %j: only a real boolean counts', async (balanceSettledOutside) => {
    expect(await failed(StaffChangeDatesDto, { ...CHANGE, balanceSettledOutside })).toContain('balanceSettledOutside');
  });

  it.each(['', 'ab', '   ', 'x'.repeat(501), undefined])('rejects the note %j on a change', async (note) => {
    expect(await failed(StaffChangeDatesDto, { ...CHANGE, note })).toContain('note');
  });
});

describe('MarkRefundPaidDto', () => {
  it('needs a note of 3 to 500 characters', async () => {
    expect(await failed(MarkRefundPaidDto, { note: 'Bank transfer' })).toEqual([]);
    expect(await failed(MarkRefundPaidDto, { note: 'ab' })).toContain('note');
    expect(await failed(MarkRefundPaidDto, {})).toContain('note');
  });
});

describe('StaffRefundsQueryDto', () => {
  it('accepts no filter, each status, and a property id', async () => {
    expect(await failed(StaffRefundsQueryDto, {})).toEqual([]);
    for (const status of ['needs_attention', 'pending', 'failed', 'succeeded', 'all']) {
      expect(await failed(StaffRefundsQueryDto, { status })).toEqual([]);
    }
    expect(await failed(StaffRefundsQueryDto, { propertyId: '33333333-3333-3333-3333-333333333331' })).toEqual([]);
  });

  it.each(['done', '', 'PENDING'])('rejects the status %j', async (status) => {
    expect(await failed(StaffRefundsQueryDto, { status })).toContain('status');
  });

  it('rejects a property id that is not an id', async () => {
    expect(await failed(StaffRefundsQueryDto, { propertyId: "x'; drop" })).toContain('propertyId');
  });
});

/**
 * @file apps/api/src/modules/bookings/bookings.repository.spec.ts
 * @feature bookings
 */

import { Test } from '@nestjs/testing';
import { Client, type PoolClient } from 'pg';
import { DatabaseService } from '../../shared/database/database.service';
import { BookingsRepository, type InsertChangeInput, type InsertRefundInput } from './bookings.repository';

const RANGE = { low: '1a2b3c4d-5e00-0000-0000-000000000000', high: '1a2b3c4d-5eff-ffff-ffff-ffffffffffff' };

describe('BookingsRepository', () => {
  const query = jest.fn<Promise<{ rows: unknown[]; rowCount?: number }>, [string, ...unknown[]]>();
  const clientQuery = jest.fn<Promise<{ rows: unknown[] }>, [string, ...unknown[]]>();
  let repository: BookingsRepository;
  let client: PoolClient;

  beforeEach(async () => {
    jest.resetAllMocks();
    query.mockResolvedValue({ rows: [] });
    clientQuery.mockResolvedValue({ rows: [] });
    const moduleRef = await Test.createTestingModule({
      providers: [BookingsRepository, { provide: DatabaseService, useValue: { query } }],
    }).compile();
    repository = moduleRef.get(BookingsRepository);
    client = Object.assign(new Client(), { release: (): void => undefined, query: clientQuery });
  });

  it('finds a booking by reference range and email in ONE statement that joins stay, property, payments and refund', async () => {
    await repository.findByReference(RANGE, 'ada@example.com');

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, ...params] = query.mock.calls[0] ?? ['', []];
    expect(sql).toContain('JOIN houses');
    expect(sql).toContain('JOIN properties');
    // Every payment of the booking arrives in the same statement as a list (a booking can be paid twice).
    expect(sql).toContain('FROM payments pay');
    expect(sql).toContain('json_agg');
    expect(sql).toContain("LEFT JOIN refunds rf ON rf.inventory_block_id = ib.id AND rf.kind = 'cancellation'");
    expect(sql).toContain('LIMIT 2');
    expect(params).toEqual([[RANGE.low, RANGE.high, 'ada@example.com']]);
  });

  it('only ever looks at reservations that are confirmed or cancelled', async () => {
    await repository.findByReference(RANGE, 'ada@example.com');

    expect(query.mock.calls[0]?.[0]).toContain("kind = 'reservation'");
    expect(query.mock.calls[0]?.[0]).toContain("status IN ('confirmed', 'cancelled')");
  });

  it('matches the email without regard to case, inside the database', async () => {
    await repository.findByReference(RANGE, 'ADA@Example.com');

    expect(query.mock.calls[0]?.[0]).toContain('lower(ib.booker_email) = lower($3)');
  });

  it('uses parameters, never the guest\'s text inside the SQL', async () => {
    await repository.findByReference(RANGE, "x'; DROP TABLE refunds; --");

    expect(query.mock.calls[0]?.[0]).not.toContain('DROP TABLE');
    expect(query.mock.calls[0]?.[1]).toEqual([RANGE.low, RANGE.high, "x'; DROP TABLE refunds; --"]);
  });

  it('reads one booking by id in one statement, or null', async () => {
    expect(await repository.findById('abc')).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('locks the booking row for the transaction and reports its status', async () => {
    clientQuery.mockResolvedValueOnce({ rows: [{ status: 'confirmed' }] });

    await expect(repository.lockForCancel(client, 'abc')).resolves.toBe('confirmed');

    expect(clientQuery.mock.calls[0]?.[0]).toContain('FOR UPDATE');
  });

  it('reports cancelled, other, and missing bookings differently', async () => {
    clientQuery.mockResolvedValueOnce({ rows: [{ status: 'cancelled' }] });
    expect(await repository.lockForCancel(client, 'a')).toBe('cancelled');
    clientQuery.mockResolvedValueOnce({ rows: [{ status: 'expired' }] });
    expect(await repository.lockForCancel(client, 'b')).toBe('other');
    clientQuery.mockResolvedValueOnce({ rows: [] });
    expect(await repository.lockForCancel(client, 'c')).toBeNull();
  });

  it('cancels only a confirmed booking and stamps the time', async () => {
    await repository.markCancelled(client, 'abc');

    const sql = clientQuery.mock.calls[0]?.[0] ?? '';
    expect(sql).toContain("SET status = 'cancelled', cancelled_at = now()");
    expect(sql).toContain("status = 'confirmed'");
  });

  it('records a guest cancellation as the guest\'s own request, with nobody else named', async () => {
    await repository.markCancelled(client, 'abc');

    expect(clientQuery.mock.calls[0]?.[1]).toEqual(['abc', 'guest_request', null, null]);
  });

  it('records who cancelled, why, and the note when staff cancel', async () => {
    await repository.markCancelled(client, 'abc', { reason: 'goodwill', staffId: 'staff-1', note: 'Burst pipe' });

    expect(clientQuery.mock.calls[0]?.[1]).toEqual(['abc', 'goodwill', 'staff-1', 'Burst pipe']);
  });

  it('records a date change as "dates_changed"', async () => {
    await repository.markCancelled(client, 'abc', { reason: 'dates_changed', staffId: null, note: null });

    expect(clientQuery.mock.calls[0]?.[1]).toEqual(['abc', 'dates_changed', null, null]);
  });

  it('says what an id is when it is not a booking (for example a hold)', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 'h', organization_id: 'o', kind: 'hold', status: 'active', currency_code: 'EUR' }] });
    expect(await repository.findKind('h')).toMatchObject({ kind: 'hold' });

    query.mockResolvedValueOnce({ rows: [] });
    expect(await repository.findKind('nope')).toBeNull();
  });

  it('inserts the refund once: a repeat does nothing and returns null', async () => {
    const input: InsertRefundInput = {
      organizationId: 'o', propertyId: 'p', bookingId: 'b', paymentId: 'pay', provider: 'mock',
      amountCents: 5000, percent: 50, currencyCode: 'EUR', status: 'pending', reason: 'Guest cancelled online',
    };
    clientQuery.mockResolvedValueOnce({ rows: [{ id: 'refund-1' }] });
    expect(await repository.insertRefund(client, input)).toBe('refund-1');

    clientQuery.mockResolvedValueOnce({ rows: [] });
    expect(await repository.insertRefund(client, input)).toBeNull();
    expect(clientQuery.mock.calls[0]?.[0]).toContain('ON CONFLICT (inventory_block_id, kind) DO NOTHING');
    expect(clientQuery.mock.calls[0]?.[1]).toContain('cancellation');
    // initiated by the guest, with the readable reason code and nobody named as the maker
    expect(clientQuery.mock.calls[0]?.[1]).toEqual(['o', 'p', 'b', 'pay', 'mock', 5000, 50, 'EUR', 'pending', 'Guest cancelled online', 'guest', 'cancellation', 'guest_request', null]);
  });

  it('records a staff refund with who made it and the staff reason', async () => {
    clientQuery.mockResolvedValueOnce({ rows: [{ id: 'refund-2' }] });

    await repository.insertRefund(client, {
      organizationId: 'o', propertyId: 'p', bookingId: 'b', paymentId: null, provider: 'manual',
      amountCents: 7000, percent: 100, currencyCode: 'EUR', status: 'pending', reason: 'Staff cancelled',
      initiatedBy: 'staff', createdByStaffId: 'staff-1', reasonCode: 'property_cancelled',
    });

    expect(clientQuery.mock.calls[0]?.[1]).toEqual(['o', 'p', 'b', null, 'manual', 7000, 100, 'EUR', 'pending', 'Staff cancelled', 'staff', 'cancellation', 'property_cancelled', 'staff-1']);
  });

  it('labels a date-change refund "dates_changed" unless told otherwise', async () => {
    clientQuery.mockResolvedValueOnce({ rows: [{ id: 'refund-3' }] });

    await repository.insertRefund(client, {
      organizationId: 'o', propertyId: 'p', bookingId: 'b', paymentId: 'pay', provider: 'mock',
      amountCents: 1000, percent: 100, currencyCode: 'EUR', status: 'pending', reason: 'Difference', kind: 'rebook_difference',
    });

    expect(clientQuery.mock.calls[0]?.[1]).toEqual(expect.arrayContaining(['rebook_difference', 'dates_changed']));
  });

  it('settles a refund with the provider\'s answer', async () => {
    await repository.completeRefund('refund-1', 'failed', '', 'provider down');

    expect(query.mock.calls[0]?.[1]).toEqual(['refund-1', 'failed', '', 'provider down']);
  });

  it('reads a booking\'s payments safely: a malformed entry becomes "refund by hand", never a wrong refund', async () => {
    query.mockResolvedValueOnce({
      rows: [
        {
          id: 'b',
          payments: [{ id: 'p2', provider: 'mock', providerRef: 'r2', refundableCents: 2000 }, { id: 3 }, null],
        },
      ],
    });

    const rows = await repository.findByReference(RANGE, 'ada@example.com');

    expect(rows[0]?.payments).toEqual([{ id: 'p2', provider: 'mock', providerRef: 'r2', refundableCents: 2000 }]);
  });

  it('counts only pending and succeeded refunds against what a payment can still give back', async () => {
    await repository.findByReference(RANGE, 'ada@example.com');

    expect(query.mock.calls[0]?.[0]).toContain("r.status IN ('pending', 'succeeded')");
  });

  it('records a date-change refund separately from a cancellation refund', async () => {
    const input: InsertRefundInput = {
      organizationId: 'o', propertyId: 'p', bookingId: 'b', paymentId: 'pay', provider: 'mock',
      amountCents: 5000, percent: 100, currencyCode: 'EUR', status: 'pending', reason: 'difference', kind: 'rebook_difference',
    };
    clientQuery.mockResolvedValueOnce({ rows: [{ id: 'refund-2' }] });

    expect(await repository.insertRefund(client, input)).toBe('refund-2');

    expect(clientQuery.mock.calls[0]?.[1]).toContain('rebook_difference');
  });

  describe('changing dates', () => {
    it('copies the old booking into the new one, keeping its saved policy and recorded terms acceptance', async () => {
      clientQuery.mockResolvedValueOnce({ rows: [{ id: 'new-1' }] });

      const id = await repository.insertRebookedBooking(client, {
        oldBookingId: 'old-1',
        newCheckIn: '2027-08-01',
        newCheckOut: '2027-08-04',
        totalCents: 60000,
        paidCents: 62000,
        priceSnapshot: '{}',
      });

      expect(id).toBe('new-1');
      const sql = clientQuery.mock.calls[0]?.[0] ?? '';
      expect(sql).toContain('policy_snapshot');
      expect(sql).toContain('terms_accepted_at');
      expect(sql).toContain('rebook_of_id');
      expect(sql).toContain("'reservation', 'confirmed'");
      expect(clientQuery.mock.calls[0]?.[1]).toEqual(['old-1', '2027-08-01', '2027-08-04', 60000, '{}', 62000]);
    });

    it('fails loudly if the new booking could not be created', async () => {
      await expect(
        repository.insertRebookedBooking(client, { oldBookingId: 'o', newCheckIn: 'a', newCheckOut: 'b', totalCents: 0, paidCents: 0, priceSnapshot: '{}' }),
      ).rejects.toThrow('returned no row');
    });

    it('lets the database reject taken dates: the raw exclusion error is not swallowed', async () => {
      clientQuery.mockRejectedValueOnce(Object.assign(new Error('conflict'), { code: '23P01' }));

      await expect(
        repository.insertRebookedBooking(client, { oldBookingId: 'o', newCheckIn: 'a', newCheckOut: 'b', totalCents: 0, paidCents: 0, priceSnapshot: '{}' }),
      ).rejects.toMatchObject({ code: '23P01' });
    });

    it('carries the guest\'s chosen requests over in one statement', async () => {
      await repository.copyRequests(client, 'old', 'new');

      expect(clientQuery).toHaveBeenCalledTimes(1);
      expect(clientQuery.mock.calls[0]?.[1]).toEqual(['old', 'new']);
    });

    it('moves only succeeded payments to the new booking', async () => {
      await repository.moveSucceededPayments(client, 'old', 'new');

      expect(clientQuery.mock.calls[0]?.[0]).toContain("status = 'succeeded'");
      expect(clientQuery.mock.calls[0]?.[1]).toEqual(['old', 'new']);
    });

    it('writes the audit record with the money that moved', async () => {
      const change: InsertChangeInput = {
        organizationId: 'o', propertyId: 'p', oldBookingId: 'old', newBookingId: 'new', paymentId: 'pay',
        oldCheckIn: '2027-07-10', oldCheckOut: '2027-07-13', newCheckIn: '2027-08-01', newCheckOut: '2027-08-04',
        oldTotalCents: 96000, newTotalCents: 60000, feeCents: 2000, payCents: 0, refundCents: 34000,
      };

      await repository.insertChange(client, change);

      expect(clientQuery.mock.calls[0]?.[0]).toContain('INSERT INTO booking_changes');
      expect(clientQuery.mock.calls[0]?.[1]).toEqual(['o', 'p', 'old', 'new', 'pay', '2027-07-10', '2027-07-13', '2027-08-01', '2027-08-04', 96000, 60000, 2000, 0, 34000, 'guest', null, null]);
    });

    it('records who made a staff change and their note', async () => {
      await repository.insertChange(client, {
        organizationId: 'o', propertyId: 'p', oldBookingId: 'old', newBookingId: 'new', paymentId: null,
        oldCheckIn: '2027-07-10', oldCheckOut: '2027-07-13', newCheckIn: '2027-08-01', newCheckOut: '2027-08-04',
        oldTotalCents: 96000, newTotalCents: 60000, feeCents: 0, payCents: 0, refundCents: 36000,
        initiatedBy: 'staff', staffId: 'staff-1', note: 'Guest phoned',
      });

      expect(clientQuery.mock.calls[0]?.[1]).toEqual(expect.arrayContaining(['staff', 'staff-1', 'Guest phoned']));
    });

    it('finds the booking a settled balance payment produced, or null', async () => {
      query.mockResolvedValueOnce({ rows: [{ new_booking_id: 'new-1' }] });
      expect(await repository.findBookingIdByChangePayment('pay-1')).toBe('new-1');

      query.mockResolvedValueOnce({ rows: [] });
      expect(await repository.findBookingIdByChangePayment('pay-2')).toBeNull();
    });
  });
});

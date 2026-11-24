/**
 * @file apps/api/src/modules/bookings/bookings.repository.spec.ts
 * @feature bookings
 */

import { Test } from '@nestjs/testing';
import { Client, type PoolClient } from 'pg';
import { DatabaseService } from '../../shared/database/database.service';
import { BookingsRepository, type InsertRefundInput } from './bookings.repository';

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

  it('finds a booking by reference range and email in ONE statement that joins stay, property, payment and refund', async () => {
    await repository.findByReference(RANGE, 'ada@example.com');

    expect(query).toHaveBeenCalledTimes(1);
    const [sql, ...params] = query.mock.calls[0] ?? ['', []];
    expect(sql).toContain('JOIN houses');
    expect(sql).toContain('JOIN properties');
    expect(sql).toContain('LEFT JOIN payments');
    expect(sql).toContain('LEFT JOIN refunds');
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

  it('inserts the refund once: a repeat does nothing and returns null', async () => {
    const input: InsertRefundInput = {
      organizationId: 'o', propertyId: 'p', bookingId: 'b', paymentId: 'pay', provider: 'mock',
      amountCents: 5000, percent: 50, currencyCode: 'EUR', status: 'pending', reason: 'Guest cancelled online',
    };
    clientQuery.mockResolvedValueOnce({ rows: [{ id: 'refund-1' }] });
    expect(await repository.insertRefund(client, input)).toBe('refund-1');

    clientQuery.mockResolvedValueOnce({ rows: [] });
    expect(await repository.insertRefund(client, input)).toBeNull();
    expect(clientQuery.mock.calls[0]?.[0]).toContain('ON CONFLICT (inventory_block_id) DO NOTHING');
    expect(clientQuery.mock.calls[0]?.[0]).toContain("'guest'");
  });

  it('settles a refund with the provider\'s answer', async () => {
    await repository.completeRefund('refund-1', 'failed', '', 'provider down');

    expect(query.mock.calls[0]?.[1]).toEqual(['refund-1', 'failed', '', 'provider down']);
  });
});

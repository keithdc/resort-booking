/**
 * @file apps/api/src/modules/reservations/report-summary.repository.spec.ts
 * @feature reservations
 * @dependencies ReportSummaryRepository
 *
 * Each report number is ONE aggregate statement, however many bookings exist (no N+1), and the
 * statements keep the rules the owner relies on: cancelled bookings only, date changes excluded.
 */

import { Test } from '@nestjs/testing';
import type { QueryResult, QueryResultRow } from 'pg';
import { DatabaseService } from '../../shared/database/database.service';
import { ReportSummaryRepository } from './report-summary.repository';

type QueryFn = (text: string, params?: readonly unknown[]) => Promise<QueryResult<QueryResultRow>>;

function result(rows: QueryResultRow[]): QueryResult<QueryResultRow> {
  return { rows, rowCount: rows.length, command: 'SELECT', oid: 0, fields: [] };
}

async function build(rowsPerCall: QueryResultRow[][]): Promise<{ repository: ReportSummaryRepository; query: jest.Mock<ReturnType<QueryFn>, Parameters<QueryFn>> }> {
  const query = jest.fn<ReturnType<QueryFn>, Parameters<QueryFn>>();
  rowsPerCall.forEach((rows: QueryResultRow[]): void => {
    query.mockResolvedValueOnce(result(rows));
  });
  const moduleRef = await Test.createTestingModule({
    providers: [ReportSummaryRepository, { provide: DatabaseService, useValue: { query } }],
  }).compile();
  return { repository: moduleRef.get(ReportSummaryRepository), query };
}

describe('ReportSummaryRepository.cancellationsByReason', () => {
  it('maps the rows and asks once, with the range and property', async () => {
    const { repository, query } = await build([
      [
        { reason: 'guest_request', cancelled_count: 2, paid_cents: 20000, refunded_cents: 5000 },
        { reason: 'property_cancelled', cancelled_count: 1, paid_cents: 9000, refunded_cents: 9000 },
      ],
    ]);

    const rows = await repository.cancellationsByReason('2027-07-01', '2027-08-01', 'prop', 'org-1');

    expect(rows).toEqual([
      { reason: 'guest_request', cancelledCount: 2, paidCents: 20000, refundedCents: 5000 },
      { reason: 'property_cancelled', cancelledCount: 1, paidCents: 9000, refundedCents: 9000 },
    ]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[1]).toEqual(['2027-07-01', '2027-08-01', 'prop', 'org-1']);
  });

  it('counts only cancelled bookings and leaves out date changes', async () => {
    const { repository, query } = await build([[]]);

    await repository.cancellationsByReason('2027-07-01', '2027-08-01', null, 'org-1');

    const sql = query.mock.calls[0]?.[0] ?? '';
    expect(sql).toContain("ib.status = 'cancelled'");
    expect(sql).toContain("<> 'dates_changed'");
    expect(sql).toContain('rebook_of_id = ib.id');
    expect(sql).toContain("CASE WHEN ib.payment_method = 'paid_by_channel' THEN 0");
    expect(query.mock.calls[0]?.[1]).toEqual(['2027-07-01', '2027-08-01', null, 'org-1']);
  });

  it('is empty when nothing was cancelled', async () => {
    const { repository } = await build([[]]);
    await expect(repository.cancellationsByReason('2027-07-01', '2027-08-01', null, 'org-1')).resolves.toEqual([]);
  });
});

describe('ReportSummaryRepository.discountUsage', () => {
  it('maps per-discount rows and counts only confirmed bookings', async () => {
    const { repository, query } = await build([
      [{ discount_id: 'd1', label: 'Long stay', redemption_count: 3, discount_cents: 12000 }],
    ]);

    const rows = await repository.discountUsage('2027-07-01', '2027-08-01', null, 'org-1');

    expect(rows).toEqual([{ discountId: 'd1', label: 'Long stay', redemptionCount: 3, discountCents: 12000 }]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain("ib.status = 'confirmed'");
  });
});

describe('ReportSummaryRepository.attention', () => {
  it('uses two statements and maps both', async () => {
    const { repository, query } = await build([
      [{ unpaid_hold_count: 2, arrivals_today_count: 1, arrivals_next_7_days_count: 4, unpaid_at_hotel_count: 5, unpaid_at_hotel_cents: 240000, unpaid_at_hotel_arrivals_next_7_days_count: 2, unpaid_at_hotel_past_count: 1 }],
      [{ refund_count: 3, refund_cents: 15000 }],
    ]);

    const attention = await repository.attention('2027-07-01', 'prop', 'org-1');

    expect(attention).toEqual({
      unpaidHoldCount: 2,
      refundsToPayCount: 3,
      refundsToPayCents: 15000,
      arrivalsTodayCount: 1,
      arrivalsNext7DaysCount: 4,
      unpaidAtHotelCount: 5,
      unpaidAtHotelCents: 240000,
      unpaidAtHotelArrivalsNext7DaysCount: 2,
      unpaidAtHotelPastCount: 1,
    });
    expect(query).toHaveBeenCalledTimes(2);
    // Only confirmed bookings of this organization that nobody has marked paid.
    expect(query.mock.calls[0]?.[0]).toContain("ib.payment_status = 'pending'");
    expect(query.mock.calls[0]?.[1]).toEqual(['2027-07-01', 'prop', 'org-1']);
    expect(query.mock.calls[1]?.[0]).toContain("status IN ('pending', 'failed')");
  });

  it('falls back to zeros when a statement returns no row', async () => {
    const { repository } = await build([[], []]);
    await expect(repository.attention('2027-07-01', null, 'org-1')).resolves.toEqual({
      unpaidHoldCount: 0,
      refundsToPayCount: 0,
      refundsToPayCents: 0,
      arrivalsTodayCount: 0,
      arrivalsNext7DaysCount: 0,
      unpaidAtHotelCount: 0,
      unpaidAtHotelCents: 0,
      unpaidAtHotelArrivalsNext7DaysCount: 0,
      unpaidAtHotelPastCount: 0,
    });
  });
});

describe('ReportSummaryRepository.cancellationRefunds', () => {
  it('maps refunds from one capped statement', async () => {
    const { repository, query } = await build([
      [
        {
          id: 'f1',
          organization_id: 'org',
          inventory_block_id: '00000001-0000-4000-8000-000000000000',
          property_name: 'Alpine Lake',
          stay_name: 'Lake Chalet',
          booker_name: 'Ada',
          booker_email: 'ada@example.com',
          kind: 'cancellation',
          amount_cents: 8000,
          percent: 25,
          currency_code: 'EUR',
          status: 'succeeded',
          provider: 'mock',
          failure_reason: null,
          reason: 'guest_request',
          initiated_by: 'guest',
          resolution_note: null,
          resolved_by_name: null,
          created_at: new Date('2027-06-01T10:00:00Z'),
        },
      ],
    ]);

    const refunds = await repository.cancellationRefunds('2027-07-01', '2027-08-01', null, 'org-1');

    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({ id: 'f1', amountCents: 8000, percent: 25, status: 'succeeded', stayName: 'Lake Chalet' });
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[0]).toContain('LIMIT 200');
  });
});

describe('ReportSummaryRepository.houseCatalog', () => {
  it('maps every stay with its property', async () => {
    const { repository, query } = await build([
      [{ house_id: 'h1', house_name: 'Lake Chalet', property_id: 'p1', property_name: 'Alpine Lake', currency_code: 'EUR' }],
    ]);

    await expect(repository.houseCatalog('p1', 'org-1')).resolves.toEqual([
      { houseId: 'h1', houseName: 'Lake Chalet', propertyId: 'p1', propertyName: 'Alpine Lake', currencyCode: 'EUR' },
    ]);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]?.[1]).toEqual(['p1', 'org-1']);
  });
});

describe('ReportSummaryRepository scopes every statement to one organization', () => {
  it.each([
    ['cancellationsByReason', (r: ReportSummaryRepository) => r.cancellationsByReason('2027-07-01', '2027-08-01', null, 'org-1'), 'ib.organization_id = $4'],
    ['cancellationRefunds', (r: ReportSummaryRepository) => r.cancellationRefunds('2027-07-01', '2027-08-01', null, 'org-1'), 'r.organization_id = $4'],
    ['discountUsage', (r: ReportSummaryRepository) => r.discountUsage('2027-07-01', '2027-08-01', null, 'org-1'), 'ib.organization_id = $4'],
    ['houseCatalog', (r: ReportSummaryRepository) => r.houseCatalog(null, 'org-1'), 'p.organization_id = $2'],
  ])('%s filters by organization_id and passes the organization last', async (_name, call, fragment) => {
    const { repository, query } = await build([[]]);

    await call(repository);

    const sql = query.mock.calls[0]?.[0] ?? '';
    expect(sql).toContain(fragment);
    const params = query.mock.calls[0]?.[1] ?? [];
    expect(params[params.length - 1]).toBe('org-1');
  });

  it('attention filters both of its statements by organization_id', async () => {
    const { repository, query } = await build([[], []]);

    await repository.attention('2027-07-01', null, 'org-1');

    expect(query.mock.calls[0]?.[0]).toContain('ib.organization_id = $3');
    expect(query.mock.calls[0]?.[1]).toEqual(['2027-07-01', null, 'org-1']);
    expect(query.mock.calls[1]?.[0]).toContain('r.organization_id = $2');
    expect(query.mock.calls[1]?.[1]).toEqual([null, 'org-1']);
  });
});

describe('ReportSummaryRepository: 64-bit sums', () => {
  it('sums money as bigint in SQL and keeps totals above 32 bits exact', async () => {
    const { repository, query } = await build([
      [{ reason: 'guest_request', cancelled_count: 3, paid_cents: '3000000000', refunded_cents: '2500000000' }],
      [{ discount_id: 'd1', label: 'Early bird', redemption_count: 2, discount_cents: '2200000000' }],
      [{ unpaid_hold_count: 0, arrivals_today_count: 0, arrivals_next_7_days_count: 0, unpaid_at_hotel_count: 1, unpaid_at_hotel_cents: '4000000000', unpaid_at_hotel_arrivals_next_7_days_count: 0, unpaid_at_hotel_past_count: 0 }],
      [{ refund_count: 1, refund_cents: '2147483648' }],
    ]);

    expect(await repository.cancellationsByReason('2027-07-01', '2027-08-01', null, 'org-1')).toEqual([
      { reason: 'guest_request', cancelledCount: 3, paidCents: 3_000_000_000, refundedCents: 2_500_000_000 },
    ]);
    expect(await repository.discountUsage('2027-07-01', '2027-08-01', null, 'org-1')).toEqual([
      { discountId: 'd1', label: 'Early bird', redemptionCount: 2, discountCents: 2_200_000_000 },
    ]);
    const attention = await repository.attention('2027-07-01', null, 'org-1');
    expect(attention.unpaidAtHotelCents).toBe(4_000_000_000);
    expect(attention.refundsToPayCents).toBe(2_147_483_648);

    for (const call of query.mock.calls) {
      expect(call[0]).not.toMatch(/SUM\([^)]*\)[^,]*\)::int\b|\), 0\)::int AS \w*cents/);
    }
  });

  it('throws instead of showing a total a number cannot hold', async () => {
    const { repository } = await build([[{ reason: 'guest_request', cancelled_count: 1, paid_cents: '9007199254740993', refunded_cents: '0' }]]);
    await expect(repository.cancellationsByReason('2027-07-01', '2027-08-01', null, 'org-1')).rejects.toThrow('too large');
  });
});

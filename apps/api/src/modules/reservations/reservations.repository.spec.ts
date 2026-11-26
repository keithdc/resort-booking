/**
 * @file apps/api/src/modules/reservations/reservations.repository.spec.ts
 * @feature reservations
 * @dependencies ReservationsRepository
 *
 * The staff lists must never ask the database once per booking (no N+1): refunds and change history
 * come back in ONE query each, however many bookings there are.
 */

import { Test } from '@nestjs/testing';
import { DatabaseService } from '../../shared/database/database.service';
import { referenceFor } from '../inventory/inventory.rules';
import { ReservationsRepository } from './reservations.repository';
import type { StaffChangeRow, StaffRefundRow } from './staff-history';

const NOW = new Date('2027-06-01T10:00:00Z');

function id(n: number): string {
  return `${n.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`;
}

function bookingRow(n: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: id(n),
    organization_id: 'org',
    property_id: 'prop',
    property_name: 'Alpine Lake',
    house_id: 'house',
    house_name: `Stay ${n}`,
    check_in: '2027-07-10',
    check_out: '2027-07-12',
    guest_count: 2,
    booker_name: 'Ada',
    booker_email: 'ada@example.com',
    booker_phone: '+33612345678',
    guest_note: '',
    payment_method: 'card',
    payment_status: 'paid',
    paid_at: null,
    created_by_name: null,
    status: 'confirmed',
    total_cents: 10000,
    currency_code: 'EUR',
    nightly_rate_cents: 5000,
    request_names: [],
    kind: 'reservation',
    arrival_status: 'expected',
    rebook_of_id: null,
    paid_cents: 10000,
    terms_accepted_at: NOW,
    cancelled_at: null,
    created_at: NOW,
    cancelled_by_staff_id: null,
    cancelled_by_name: null,
    cancel_reason: null,
    cancel_note: null,
    replaced_by_id: null,
    ...overrides,
  };
}

function refundRow(blockId: string, overrides: Partial<StaffRefundRow> = {}): StaffRefundRow {
  return {
    id: `refund-${blockId}`,
    organization_id: 'org',
    inventory_block_id: blockId,
    property_name: 'Alpine Lake',
    stay_name: 'Stay',
    booker_name: 'Ada',
    booker_email: 'ada@example.com',
    kind: 'cancellation',
    amount_cents: 5000,
    percent: 50,
    currency_code: 'EUR',
    status: 'succeeded',
    provider: 'mock',
    failure_reason: null,
    reason: 'guest_request',
    initiated_by: 'guest',
    resolution_note: null,
    resolved_by_name: null,
    created_at: NOW,
    ...overrides,
  };
}

function changeRow(oldId: string, newId: string): StaffChangeRow {
  return {
    id: `change-${oldId}`,
    old_booking_id: oldId,
    new_booking_id: newId,
    old_check_in: '2027-07-10',
    old_check_out: '2027-07-12',
    new_check_in: '2027-08-01',
    new_check_out: '2027-08-03',
    old_total_cents: 10000,
    new_total_cents: 9000,
    fee_cents: 0,
    pay_cents: 0,
    refund_cents: 1000,
    initiated_by: 'staff',
    staff_name: 'Sam',
    note: 'Guest asked',
    created_at: NOW,
  };
}

describe('ReservationsRepository staff reads', () => {
  const query = jest.fn();
  let repository: ReservationsRepository;

  /** Answers by looking at which statement was sent. */
  function answer(bookings: Record<string, unknown>[], refunds: StaffRefundRow[], changes: StaffChangeRow[]): void {
    query.mockImplementation((sql: string) => {
      if (sql.includes('FROM refunds r')) {
        return Promise.resolve({ rows: refunds });
      }
      if (sql.includes('booking_changes')) {
        return Promise.resolve({ rows: changes });
      }
      return Promise.resolve({ rows: bookings });
    });
  }

  beforeEach(async (): Promise<void> => {
    query.mockReset();
    const moduleRef = await Test.createTestingModule({
      providers: [ReservationsRepository, { provide: DatabaseService, useValue: { query } }],
    }).compile();
    repository = moduleRef.get(ReservationsRepository);
  });

  it.each([1, 5, 50])('listConfirmedOnDate with %i bookings sends exactly 3 statements', async (count) => {
    const bookings = Array.from({ length: count }, (_, index) => bookingRow(index + 1));
    answer(bookings, bookings.map((row) => refundRow(String(row['id']))), []);

    const result = await repository.listConfirmedOnDate('2027-07-10', null, 'org-1');

    expect(result).toHaveLength(count);
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('listPipelineOnDate also sends 3 statements for many bookings', async () => {
    answer(Array.from({ length: 20 }, (_, index) => bookingRow(index + 1)), [], []);

    await repository.listPipelineOnDate('2027-07-10', null, 'org-1');

    expect(query).toHaveBeenCalledTimes(3);
  });

  it('asks for history with the whole id list in one array each', async () => {
    answer([bookingRow(1), bookingRow(2)], [], []);

    await repository.listConfirmedOnDate('2027-07-10', null, 'org-1');

    expect(query.mock.calls[1]?.[1]).toEqual([[id(1), id(2)]]);
    expect(query.mock.calls[2]?.[1]).toEqual([[id(1), id(2)]]);
    expect(String(query.mock.calls[1]?.[0])).toContain('ANY($1::uuid[])');
  });

  it('skips both history queries when there are no bookings', async () => {
    answer([], [], []);

    expect(await repository.listConfirmedOnDate('2027-07-10', null, 'org-1')).toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('the aggregate-only lists load no history at all', async () => {
    answer([bookingRow(1), bookingRow(2)], [refundRow(id(1))], []);

    const pipeline = await repository.listPipelineOverlapping('2027-07-01', '2027-07-31', null, 'org-1');
    await repository.listConfirmedOverlapping('2027-07-01', '2027-07-31', null, 'org-1');

    expect(query).toHaveBeenCalledTimes(2);
    expect(pipeline[0]?.refunds).toEqual([]);
    expect(pipeline[0]?.changes).toEqual([]);
  });

  it('puts each refund and change on the right booking, and a change on both its old and new booking', async () => {
    answer([bookingRow(1), bookingRow(2), bookingRow(3)], [refundRow(id(1)), refundRow(id(1), { id: 'r2', kind: 'rebook_difference' }), refundRow(id(3))], [changeRow(id(1), id(2))]);

    const [first, second, third] = await repository.listConfirmedOnDate('2027-07-10', null, 'org-1');

    expect(first?.refunds.map((refund) => refund.id)).toEqual([`refund-${id(1)}`, 'r2']);
    expect(second?.refunds).toEqual([]);
    expect(third?.refunds).toHaveLength(1);
    expect(first?.changes).toHaveLength(1);
    expect(second?.changes[0]).toMatchObject({ fromReference: referenceFor(id(1)), toReference: referenceFor(id(2)), initiatedBy: 'staff', staffName: 'Sam', note: 'Guest asked' });
    expect(third?.changes).toEqual([]);
  });

  it('maps the booking fields staff need: reference, paid, terms, replaced and rebook references', async () => {
    answer([bookingRow(2, { rebook_of_id: id(1) }), bookingRow(1, { status: 'cancelled', replaced_by_id: id(2), cancelled_at: NOW, cancel_reason: 'dates_changed', cancelled_by_staff_id: 's', cancelled_by_name: 'Sam', cancel_note: 'Moved' })], [], []);

    const [replacement, original] = await repository.listPipelineOnDate('2027-07-10', null, 'org-1');

    expect(replacement).toMatchObject({ reference: referenceFor(id(2)), paidCents: 10000, termsAcceptedAt: NOW.toISOString(), rebookOfReference: referenceFor(id(1)), cancellation: null });
    expect(original).toMatchObject({
      replacedByReference: referenceFor(id(2)),
      cancellation: { initiatedBy: 'staff', reason: 'dates_changed', note: 'Moved', staffName: 'Sam', cancelledAt: NOW.toISOString() },
    });
  });

  it('a guest cancellation of an old booking (no staff, no reason saved) reads as the guest asking', async () => {
    answer([bookingRow(1, { status: 'cancelled', cancelled_at: null })], [], []);

    const [only] = await repository.listPipelineOnDate('2027-07-10', null, 'org-1');

    expect(only?.cancellation).toMatchObject({ initiatedBy: 'guest', reason: 'guest_request', staffName: null, cancelledAt: NOW.toISOString() });
  });

  it('getById loads that one booking with its history in 3 statements, null when missing', async () => {
    answer([bookingRow(1)], [refundRow(id(1))], []);
    expect((await repository.getById(id(1)))?.refunds).toHaveLength(1);
    expect(query).toHaveBeenCalledTimes(3);

    query.mockReset();
    answer([], [], []);
    expect(await repository.getById(id(1))).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
  });
});

describe('ReservationsRepository scopes every list to one organization', () => {
  const query = jest.fn();
  let repository: ReservationsRepository;

  beforeEach(async (): Promise<void> => {
    query.mockReset();
    query.mockResolvedValue({ rows: [] });
    const moduleRef = await Test.createTestingModule({
      providers: [ReservationsRepository, { provide: DatabaseService, useValue: { query } }],
    }).compile();
    repository = moduleRef.get(ReservationsRepository);
  });

  it.each([
    ['listConfirmedOverlapping', (r: ReservationsRepository) => r.listConfirmedOverlapping('2027-07-01', '2027-07-31', null, 'org-1'), 'ib.organization_id = $4'],
    ['listPipelineOverlapping', (r: ReservationsRepository) => r.listPipelineOverlapping('2027-07-01', '2027-07-31', null, 'org-1'), 'ib.organization_id = $4'],
    ['listConfirmedOnDate', (r: ReservationsRepository) => r.listConfirmedOnDate('2027-07-10', null, 'org-1'), 'ib.organization_id = $3'],
    ['listPipelineOnDate', (r: ReservationsRepository) => r.listPipelineOnDate('2027-07-10', null, 'org-1'), 'ib.organization_id = $3'],
  ])('%s filters by organization_id and passes the organization after the property filter', async (_name, call, fragment) => {
    await call(repository);

    expect(String(query.mock.calls[0]?.[0])).toContain(fragment);
    const params = query.mock.calls[0]?.[1] ?? [];
    expect(params[params.length - 1]).toBe('org-1');
  });

  it("listBookingConfig reads only the organization's properties and ladders", async () => {
    await repository.listBookingConfig('org-1');

    expect(String(query.mock.calls[0]?.[0])).toContain('p.organization_id = $1::uuid');
    expect(query.mock.calls[0]?.[1]).toEqual(['org-1', null]);
    expect(String(query.mock.calls[1]?.[0])).toContain('organization_id = $1::uuid');
    expect(query.mock.calls[1]?.[1]).toEqual(['org-1', null]);
  });

  it('getBookingConfig asks for one property id only (no whole-table read)', async () => {
    await repository.getBookingConfig('p1');

    expect(query.mock.calls[0]?.[1]).toEqual([null, 'p1']);
    expect(query.mock.calls[1]?.[1]).toEqual([null, 'p1']);
  });
});

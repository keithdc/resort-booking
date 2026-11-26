/**
 * @file apps/api/src/modules/bookings/bookings.service.spec.ts
 * @feature bookings
 * @dependencies BookingsService, @nestjs/testing
 */

import { ConflictException, Logger, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client, type PoolClient } from 'pg';
import { DatabaseService } from '../../shared/database/database.service';
import { PaymentsService } from '../payments/payments.service';
import type { RefundRequest, RefundResult } from '../payments/payment-provider';
import type { PolicySnapshot } from '../reservations/reservations.rules';
import { ReservationsService } from '../reservations/reservations.service';
import { BookingReader } from './booking-reader';
import { BookingsRepository, type BookingRow, type InsertRefundInput } from './bookings.repository';
import { BookingsService } from './bookings.service';
import { RefundIssuer } from './refund-issuer';
import { RefundTimings } from './refund-timings';
import { BOOKING_STARTED_MESSAGE } from './bookings.rules';

const ID = '1a2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d';
const REFERENCE = 'BK-1A2B3C4D5E';
const EMAIL = 'ada@example.com';
const TODAY = '2027-06-01';
const REQUEST = { reference: REFERENCE, email: EMAIL };

const LADDER = [
  { minDaysBeforeCheckIn: 7, refundPercent: 100 },
  { minDaysBeforeCheckIn: 3, refundPercent: 75 },
  { minDaysBeforeCheckIn: 0, refundPercent: 0 },
];

function snapshot(overrides: Partial<PolicySnapshot> = {}): PolicySnapshot {
  return { tiers: LADDER, rebookable: true, rebookFeeType: 'fixed', rebookFeeValue: 20, ...overrides };
}

function row(overrides: Partial<BookingRow> = {}): BookingRow {
  return {
    id: ID,
    organization_id: 'org',
    property_id: 'prop',
    house_id: 'house',
    property_name: 'Alpine Lake',
    property_timezone: 'Europe/Paris',
    stay_name: 'Lake Chalet',
    status: 'confirmed',
    check_in: '2027-07-10',
    check_out: '2027-07-13',
    guest_count: 2,
    booker_name: 'Ada Lovelace',
    booker_email: EMAIL,
    booker_phone: '+33612345678',
    guest_note: '',
    payment_method: 'card',
    payment_status: 'paid',
    total_cents: 96000,
    currency_code: 'EUR',
    policy_snapshot: snapshot(),
    price_snapshot: null,
    rebook_of_id: null,
    replaced_by_id: null,
    payments: [{ id: 'pay-1', provider: 'mock', providerRef: 'mock_pi_abc', refundableCents: 96000 }],
    paid_cents: 96000,
    refund_id: null,
    refund_amount_cents: null,
    refund_percent: null,
    refund_status: null,
    refund_provider: null,
    refund_currency: null,
    ...overrides,
  };
}

function cancelled(refund: Partial<BookingRow> = {}): BookingRow {
  return row({
    status: 'cancelled',
    refund_id: 'refund-1',
    refund_amount_cents: 96000,
    refund_percent: 100,
    refund_status: 'succeeded',
    refund_provider: 'mock',
    refund_currency: 'EUR',
    ...refund,
  });
}

function fakeClient(log: string[], query: jest.Mock): PoolClient {
  return Object.assign(new Client(), {
    release: (): void => undefined,
    query: (text: string): Promise<unknown> => {
      log.push(text);
      return query(text) as Promise<unknown>;
    },
  });
}

describe('BookingsService', () => {
  const findByReference = jest.fn<Promise<BookingRow[]>, [{ low: string; high: string }, string]>();
  const findById = jest.fn<Promise<BookingRow | null>, [string]>();
  const lockForCancel = jest.fn<Promise<'confirmed' | 'cancelled' | 'other' | null>, [PoolClient, string]>();
  const markCancelled = jest.fn<Promise<void>, [PoolClient, string]>();
  const insertRefund = jest.fn<Promise<string | null>, [PoolClient, InsertRefundInput]>();
  const completeRefund = jest.fn<Promise<void>, [string, 'succeeded' | 'failed', string, string | null]>();
  const describeProvider = jest.fn<{ name: string; simulated: boolean }, []>();
  const issueRefund = jest.fn<Promise<RefundResult>, [RefundRequest]>();
  const getPolicySnapshot = jest.fn<Promise<PolicySnapshot>, [string]>();
  const clientQuery = jest.fn<Promise<unknown>, [string]>();
  let log: string[];
  let withClientCalls: number;
  let service: BookingsService;

  beforeEach(async (): Promise<void> => {
    jest.resetAllMocks();
    jest.useFakeTimers({
      now: new Date(`${TODAY}T12:00:00Z`),
      doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask', 'performance', 'hrtime'],
    });
    jest.spyOn(Logger.prototype, 'error').mockImplementation((): void => undefined);
    log = [];
    withClientCalls = 0;
    findByReference.mockResolvedValue([row()]);
    findById.mockResolvedValue(cancelled());
    lockForCancel.mockImplementation(() => {
      log.push('lock');
      return Promise.resolve('confirmed');
    });
    markCancelled.mockImplementation(() => {
      log.push('markCancelled');
      return Promise.resolve();
    });
    insertRefund.mockImplementation(() => {
      log.push('insertRefund');
      return Promise.resolve('refund-1');
    });
    completeRefund.mockImplementation(() => {
      log.push('completeRefund');
      return Promise.resolve();
    });
    issueRefund.mockImplementation(() => {
      log.push('providerRefund');
      return Promise.resolve({ providerRef: 'mock_re_1', status: 'succeeded' });
    });
    describeProvider.mockReturnValue({ name: 'mock', simulated: true });
    getPolicySnapshot.mockResolvedValue(snapshot({ tiers: [{ minDaysBeforeCheckIn: 0, refundPercent: 10 }] }));
    clientQuery.mockResolvedValue({ rows: [] });

    const moduleRef = await Test.createTestingModule({
      providers: [
        BookingsService,
        BookingReader,
        RefundIssuer,
        { provide: RefundTimings, useValue: { values: { providerTimeoutMs: 20_000, leaseSeconds: 150 } } },
        { provide: BookingsRepository, useValue: { findByReference, findById, lockForCancel, markCancelled, insertRefund, completeRefund } },
        { provide: PaymentsService, useValue: { describeProvider, issueRefund } },
        { provide: ReservationsService, useValue: { getPolicySnapshot } },
        {
          provide: DatabaseService,
          useValue: {
            withClient: (work: (client: PoolClient) => Promise<unknown>) => {
              withClientCalls += 1;
              return work(fakeClient(log, clientQuery));
            },
          },
        },
      ],
    }).compile();
    service = moduleRef.get(BookingsService);
  });

  afterEach((): void => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('lookup', () => {
    it('shows a confirmed booking with what cancelling now would refund', async () => {
      const booking = await service.lookup(REQUEST);

      expect(booking).toEqual({
        reference: REFERENCE,
        reservationId: ID,
        stayName: 'Lake Chalet',
        propertyName: 'Alpine Lake',
        checkIn: '2027-07-10',
        checkOut: '2027-07-13',
        guestCount: 2,
        bookerName: 'Ada Lovelace',
        totalCents: 96000,
        currencyCode: 'EUR',
        status: 'confirmed',
        canCancel: true,
        cancelBlockedReason: null,
        refundQuote: { paidCents: 96000, refundPercent: 100, refundCents: 96000, currencyCode: 'EUR', daysBeforeCheckIn: 39 },
        refund: null,
        rebookable: true,
        canChangeDates: true,
        changeDatesBlockedReason: null,
        replacedByReference: null,
      });
    });

    it('exposes only the contract fields: no phone, no email, no staff data', async () => {
      const booking = await service.lookup(REQUEST);

      expect(Object.keys(booking).sort()).toEqual([
        'bookerName', 'cancelBlockedReason', 'canCancel', 'checkIn', 'checkOut', 'currencyCode', 'guestCount', 'propertyName',
        'rebookable', 'reference', 'refund', 'refundQuote', 'reservationId', 'status', 'stayName', 'totalCents',
        'canChangeDates', 'changeDatesBlockedReason', 'replacedByReference',
      ].sort());
    });

    it('looks the booking up by a range of ids and the trimmed email, with one query', async () => {
      await service.lookup({ reference: ' bk-1a2b3c4d5e ', email: `  ${EMAIL} ` });

      expect(findByReference).toHaveBeenCalledTimes(1);
      expect(findByReference).toHaveBeenCalledWith(
        { low: '1a2b3c4d-5e00-0000-0000-000000000000', high: '1a2b3c4d-5eff-ffff-ffff-ffffffffffff' },
        EMAIL,
      );
    });

    it('gives the SAME 404 for a wrong reference, a wrong email, and an ambiguous reference', async () => {
      const messages: string[] = [];
      const attempts: Array<() => Promise<unknown>> = [
        () => service.lookup({ reference: 'not-a-reference', email: EMAIL }),
        () => {
          findByReference.mockResolvedValueOnce([]);
          return service.lookup(REQUEST);
        },
        () => {
          findByReference.mockResolvedValueOnce([row(), row({ id: '1a2b3c4d-5e11-4a8b-9c0d-1e2f3a4b5c6d' })]);
          return service.lookup(REQUEST);
        },
      ];
      for (const attempt of attempts) {
        const failure = await attempt().catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(NotFoundException);
        messages.push(JSON.stringify((failure as NotFoundException).getResponse()));
      }

      expect(new Set(messages).size).toBe(1);
      expect(messages[0]).toContain('BOOKING_NOT_FOUND');
    });

    it('does not even query when the reference cannot be a reference', async () => {
      await expect(service.lookup({ reference: 'hello', email: EMAIL })).rejects.toBeInstanceOf(NotFoundException);

      expect(findByReference).not.toHaveBeenCalled();
    });

    it('quotes from the policy saved with the booking, not today\'s admin edits', async () => {
      // Today's policy would refund only 10%; the booking was made under 100% at 7+ days.
      const booking = await service.lookup(REQUEST);

      expect(booking.refundQuote?.refundPercent).toBe(100);
      expect(getPolicySnapshot).not.toHaveBeenCalled();
    });

    it.each([null, 'garbage', { tiers: 'nope' }, {}])('falls back to the current policy when the saved one is %j', async (saved) => {
      findByReference.mockResolvedValue([row({ policy_snapshot: saved })]);

      const booking = await service.lookup(REQUEST);

      expect(getPolicySnapshot).toHaveBeenCalledWith('prop');
      expect(booking.refundQuote?.refundPercent).toBe(10);
    });

    it('uses the booking total when no payment is on record', async () => {
      findByReference.mockResolvedValue([row({ paid_cents: null, payments: [] })]);

      const booking = await service.lookup(REQUEST);

      expect(booking.refundQuote?.paidCents).toBe(96000);
    });

    it('uses what was actually paid when that differs from the total', async () => {
      findByReference.mockResolvedValue([row({ paid_cents: 50000 })]);

      const booking = await service.lookup(REQUEST);

      expect(booking.refundQuote).toMatchObject({ paidCents: 50000, refundCents: 50000 });
    });

    it('can cancel on the check-in day itself, under the last tier', async () => {
      findByReference.mockResolvedValue([row({ check_in: TODAY, check_out: '2027-06-03' })]);

      const booking = await service.lookup(REQUEST);

      expect(booking.canCancel).toBe(true);
      expect(booking.refundQuote).toMatchObject({ daysBeforeCheckIn: 0, refundPercent: 0, refundCents: 0 });
    });

    it('cannot be cancelled online once the check-in date has passed, and says what to do', async () => {
      findByReference.mockResolvedValue([row({ check_in: '2027-05-30', check_out: '2027-06-03' })]);

      const booking = await service.lookup(REQUEST);

      expect(booking.canCancel).toBe(false);
      expect(booking.cancelBlockedReason).toBe(BOOKING_STARTED_MESSAGE);
      expect(booking.refundQuote).toBeNull();
    });

    it('works out "today" in the property timezone, not the server\'s', async () => {
      // 23:30 UTC on 1 June is already 2 June in Paris, so a 2 June check-in is the check-in day (0 days).
      jest.setSystemTime(new Date('2027-06-01T23:30:00Z'));
      findByReference.mockResolvedValue([row({ check_in: '2027-06-02', check_out: '2027-06-04' })]);

      const booking = await service.lookup(REQUEST);

      expect(booking.refundQuote?.daysBeforeCheckIn).toBe(0);
    });

    it('shows a cancelled booking with its refund and no cancel option', async () => {
      findByReference.mockResolvedValue([cancelled()]);

      const booking = await service.lookup(REQUEST);

      expect(booking).toMatchObject({
        status: 'cancelled',
        canCancel: false,
        cancelBlockedReason: 'This booking is already cancelled.',
        refundQuote: null,
        rebookable: false,
        refund: { amountCents: 96000, percent: 100, currencyCode: 'EUR', status: 'succeeded', simulated: true },
      });
      expect(getPolicySnapshot).not.toHaveBeenCalled();
    });

    it('does not call a manual refund simulated, because someone has real work to do', async () => {
      findByReference.mockResolvedValue([cancelled({ refund_provider: 'manual', refund_status: 'pending' })]);

      const booking = await service.lookup(REQUEST);

      expect(booking.refund).toMatchObject({ status: 'pending', simulated: false });
    });

    it('does not call a refund simulated when the active provider is a real one', async () => {
      describeProvider.mockReturnValue({ name: 'stripe', simulated: false });
      findByReference.mockResolvedValue([cancelled()]);

      const booking = await service.lookup(REQUEST);

      expect(booking.refund?.simulated).toBe(false);
    });

    it('shows a cancelled booking with no refund row as having no refund (for example staff cancelled it)', async () => {
      findByReference.mockResolvedValue([cancelled({ refund_id: null, refund_amount_cents: null, refund_percent: null, refund_status: null })]);

      const booking = await service.lookup(REQUEST);

      expect(booking.status).toBe('cancelled');
      expect(booking.refund).toBeNull();
    });
  });

  describe('cancel: refund tiers', () => {
    it('refunds in full far enough ahead: cancels, records the refund, then asks the provider', async () => {
      const booking = await service.cancel(REQUEST);

      expect(insertRefund).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          bookingId: ID,
          paymentId: 'pay-1',
          provider: 'mock',
          amountCents: 96000,
          percent: 100,
          currencyCode: 'EUR',
          status: 'pending',
        }),
      );
      expect(issueRefund).toHaveBeenCalledWith({
        providerRef: 'mock_pi_abc',
        amountCents: 96000,
        currencyCode: 'EUR',
        reason: 'Guest cancelled online',
        idempotencyKey: 'refund-refund-1-g1-c0',
      });
      expect(completeRefund).toHaveBeenCalledWith('refund-1', 'succeeded', 'mock_re_1', null, {});
      expect(booking.status).toBe('cancelled');
      expect(booking.refund).toMatchObject({ amountCents: 96000, status: 'succeeded' });
    });

    it('refunds 75% in the middle tier, rounded to whole cents', async () => {
      findByReference.mockResolvedValue([row({ check_in: '2027-06-05', check_out: '2027-06-08', paid_cents: 33333 })]);

      await service.cancel(REQUEST);

      expect(insertRefund).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ amountCents: 25000, percent: 75 }));
      expect(issueRefund).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 25000 }));
    });

    it('records a zero refund as done and never calls the provider for nothing', async () => {
      findByReference.mockResolvedValue([row({ check_in: TODAY, check_out: '2027-06-03' })]);

      await service.cancel(REQUEST);

      expect(insertRefund).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ amountCents: 0, percent: 0, status: 'succeeded' }));
      expect(issueRefund).not.toHaveBeenCalled();
      expect(completeRefund).not.toHaveBeenCalled();
    });

    it('refunds by the policy saved with the booking, not the current one', async () => {
      // Current policy would refund 10%; the saved one gives 100%.
      await service.cancel(REQUEST);

      expect(insertRefund).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ percent: 100 }));
      expect(getPolicySnapshot).not.toHaveBeenCalled();
    });

    it('falls back to the current policy for an older booking with no saved one', async () => {
      findByReference.mockResolvedValue([row({ policy_snapshot: null })]);

      await service.cancel(REQUEST);

      expect(getPolicySnapshot).toHaveBeenCalledWith('prop');
      expect(insertRefund).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ percent: 10, amountCents: 9600 }));
    });
  });

  describe('a booking whose dates were changed', () => {
    const NEW_ID = '9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a';
    const NEW_REFERENCE = 'BK-9F8E7D6C5B';

    // The new booking copied the old one's policy snapshot, holds its price plus the change fee, and carries the payments.
    function changed(overrides: Partial<BookingRow> = {}): BookingRow {
      return row({
        id: NEW_ID,
        check_in: '2027-08-01',
        check_out: '2027-08-04',
        total_cents: 60000,
        paid_cents: 62000,
        rebook_of_id: ID,
        payments: [{ id: 'pay-1', provider: 'mock', providerRef: 'mock_pi_abc', refundableCents: 62000 }],
        ...overrides,
      });
    }

    it('refunds from what the NEW booking holds, under the policy it started with, not today\'s', async () => {
      findByReference.mockResolvedValue([changed()]);

      await service.cancel({ reference: NEW_REFERENCE, email: EMAIL });

      expect(getPolicySnapshot).not.toHaveBeenCalled();
      expect(insertRefund).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ bookingId: NEW_ID, amountCents: 62000, percent: 100 }),
      );
      expect(issueRefund).toHaveBeenCalledWith(expect.objectContaining({ providerRef: 'mock_pi_abc', amountCents: 62000 }));
    });

    it('refunds across the original payment and the balance payment when both were made', async () => {
      findByReference.mockResolvedValue([
        changed({
          paid_cents: 122000,
          total_cents: 120000,
          payments: [
            { id: 'pay-2', provider: 'mock', providerRef: 'mock_pi_balance', refundableCents: 26000 },
            { id: 'pay-1', provider: 'mock', providerRef: 'mock_pi_abc', refundableCents: 96000 },
          ],
        }),
      ]);

      await service.cancel({ reference: NEW_REFERENCE, email: EMAIL });

      expect(issueRefund.mock.calls.map((call) => [call[0].providerRef, call[0].amountCents])).toEqual([
        ['mock_pi_balance', 26000],
        ['mock_pi_abc', 96000],
      ]);
      expect(completeRefund).toHaveBeenCalledWith('refund-1', 'succeeded', 'mock_re_1,mock_re_1', null, {});
    });

    it('can still be changed again: it carries the same saved policy and a future check-in', async () => {
      findByReference.mockResolvedValue([changed()]);

      const booking = await service.lookup({ reference: NEW_REFERENCE, email: EMAIL });

      expect(booking).toMatchObject({ reference: NEW_REFERENCE, canChangeDates: true, changeDatesBlockedReason: null, rebookable: true, replacedByReference: null });
    });

    it('shows a pay-at-hotel booking nothing was paid for: it can be cancelled with nothing to refund, but its dates cannot be changed online', async () => {
      findByReference.mockResolvedValue([changed({ payment_method: 'pay_at_hotel', payment_status: 'pending', paid_cents: 0 })]);

      const booking = await service.lookup({ reference: NEW_REFERENCE, email: EMAIL });

      expect(booking).toMatchObject({ status: 'confirmed', canCancel: true, canChangeDates: false });
      expect(booking.refundQuote).toMatchObject({ paidCents: 0, refundCents: 0 });
      expect(booking.changeDatesBlockedReason).toContain('paid at the property');
    });

    it('shows the OLD booking as cancelled, pointing at its replacement, with no cancellation refund', async () => {
      findByReference.mockResolvedValue([cancelled({ replaced_by_id: NEW_ID, refund_id: null, refund_amount_cents: null, refund_percent: null, refund_status: null })]);

      const booking = await service.lookup(REQUEST);

      expect(booking).toMatchObject({
        status: 'cancelled',
        canCancel: false,
        canChangeDates: false,
        replacedByReference: NEW_REFERENCE,
        refund: null,
      });
      expect(booking.changeDatesBlockedReason).toBe(`The dates of this booking were changed. Your new booking is ${NEW_REFERENCE}.`);
    });

    it('cancelling the OLD booking again is harmless: it is already cancelled, no refund, no write', async () => {
      findByReference.mockResolvedValue([cancelled({ replaced_by_id: NEW_ID, refund_id: null, refund_amount_cents: null, refund_percent: null, refund_status: null })]);

      const booking = await service.cancel(REQUEST);

      expect(booking.status).toBe('cancelled');
      expect(insertRefund).not.toHaveBeenCalled();
      expect(withClientCalls).toBe(0);
    });
  });

  describe('lookup: can the dates be changed', () => {
    it('is blocked by the policy saved with the booking, with the reason', async () => {
      findByReference.mockResolvedValue([row({ policy_snapshot: snapshot({ rebookable: false }) })]);

      const booking = await service.lookup(REQUEST);

      expect(booking).toMatchObject({
        rebookable: false,
        canChangeDates: false,
        changeDatesBlockedReason: 'The dates of this booking cannot be changed. To change them, cancel and book again.',
      });
    });

    it('is blocked once the booking has started', async () => {
      findByReference.mockResolvedValue([row({ check_in: '2027-05-30', check_out: '2027-06-03' })]);

      const booking = await service.lookup(REQUEST);

      expect(booking).toMatchObject({ canChangeDates: false, changeDatesBlockedReason: BOOKING_STARTED_MESSAGE });
    });

    it('is blocked on a cancelled booking, with a plain reason', async () => {
      findByReference.mockResolvedValue([cancelled()]);

      const booking = await service.lookup(REQUEST);

      expect(booking).toMatchObject({ canChangeDates: false, changeDatesBlockedReason: 'This booking is cancelled.', replacedByReference: null });
    });

    it('is allowed on the check-in day itself', async () => {
      findByReference.mockResolvedValue([row({ check_in: TODAY, check_out: '2027-06-03' })]);

      expect((await service.lookup(REQUEST)).canChangeDates).toBe(true);
    });
  });

  describe('cancel: transaction and ordering', () => {
    it('does the cancel and the refund record in ONE transaction, and calls the provider only after it commits', async () => {
      await service.cancel(REQUEST);

      expect(withClientCalls).toBe(1);
      expect(log).toEqual(['BEGIN', 'lock', 'markCancelled', 'insertRefund', 'COMMIT', 'providerRefund', 'completeRefund']);
    });

    it('rolls everything back and never touches the provider if the cancel fails', async () => {
      markCancelled.mockRejectedValue(new Error('disk full'));

      await expect(service.cancel(REQUEST)).rejects.toThrow('disk full');

      expect(log).toContain('ROLLBACK');
      expect(log).not.toContain('COMMIT');
      expect(issueRefund).not.toHaveBeenCalled();
    });

    it('is harmless to repeat: an already-cancelled booking is returned with no new refund', async () => {
      findByReference.mockResolvedValue([cancelled()]);

      const booking = await service.cancel(REQUEST);

      expect(booking.status).toBe('cancelled');
      expect(withClientCalls).toBe(0);
      expect(insertRefund).not.toHaveBeenCalled();
      expect(issueRefund).not.toHaveBeenCalled();
    });

    it('handles two cancels at once: the loser finds it already cancelled and refunds nothing', async () => {
      lockForCancel.mockResolvedValue('cancelled');

      const booking = await service.cancel(REQUEST);

      expect(log).toContain('ROLLBACK');
      expect(markCancelled).not.toHaveBeenCalled();
      expect(insertRefund).not.toHaveBeenCalled();
      expect(issueRefund).not.toHaveBeenCalled();
      expect(booking.status).toBe('cancelled');
    });

    it('does not ask the provider again if the refund row already existed', async () => {
      insertRefund.mockResolvedValue(null);

      await service.cancel(REQUEST);

      expect(issueRefund).not.toHaveBeenCalled();
    });

    it('is a 404 if the booking vanished before the lock', async () => {
      lockForCancel.mockResolvedValue(null);

      await expect(service.cancel(REQUEST)).rejects.toBeInstanceOf(NotFoundException);
      expect(insertRefund).not.toHaveBeenCalled();
    });
  });

  describe('cancel: guards', () => {
    it('refuses a booking whose check-in date has passed, without writing anything', async () => {
      findByReference.mockResolvedValue([row({ check_in: '2027-05-30', check_out: '2027-06-03' })]);

      const attempt = service.cancel(REQUEST);

      await expect(attempt).rejects.toBeInstanceOf(ConflictException);
      await expect(attempt).rejects.toMatchObject({ response: { code: 'CANCELLATION_NOT_ALLOWED', message: BOOKING_STARTED_MESSAGE } });
      expect(withClientCalls).toBe(0);
      expect(issueRefund).not.toHaveBeenCalled();
    });

    it('is a 404, with nothing written, for a wrong email or reference', async () => {
      findByReference.mockResolvedValue([]);

      await expect(service.cancel({ reference: REFERENCE, email: 'someone@else.com' })).rejects.toMatchObject({
        response: { code: 'BOOKING_NOT_FOUND' },
      });
      expect(withClientCalls).toBe(0);
    });
  });

  describe('cancel: when the money cannot move', () => {
    it('keeps the booking cancelled and records a failed refund when the provider fails', async () => {
      issueRefund.mockImplementation(() => {
        log.push('providerRefund');
        return Promise.reject(new Error('provider unreachable'));
      });
      findById.mockResolvedValue(cancelled({ refund_status: 'failed' }));

      const booking = await service.cancel(REQUEST);

      expect(log.indexOf('COMMIT')).toBeLessThan(log.indexOf('providerRefund'));
      expect(completeRefund).toHaveBeenCalledWith('refund-1', 'failed', '', 'provider unreachable', { bumpKeyGeneration: true });
      expect(booking.status).toBe('cancelled');
      expect(booking.refund?.status).toBe('failed');
      expect(Logger.prototype.error).toHaveBeenCalled();
    });

    it('does not throw if saving the provider\'s answer fails (the money already moved)', async () => {
      completeRefund.mockRejectedValue(new Error('db down'));

      await expect(service.cancel(REQUEST)).resolves.toMatchObject({ status: 'cancelled' });
      expect(Logger.prototype.error).toHaveBeenCalled();
    });

    it('leaves the refund for the operator when there is no online payment on record', async () => {
      findByReference.mockResolvedValue([row({ payments: [], paid_cents: null })]);

      await service.cancel(REQUEST);

      expect(insertRefund).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ provider: 'manual', status: 'pending', paymentId: null, amountCents: 96000 }),
      );
      expect(issueRefund).not.toHaveBeenCalled();
    });

    it('leaves the refund for the operator when the payment was taken with a different provider', async () => {
      describeProvider.mockReturnValue({ name: 'stripe', simulated: false });

      await service.cancel(REQUEST);

      expect(insertRefund).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ provider: 'manual', status: 'pending', paymentId: 'pay-1' }));
      expect(issueRefund).not.toHaveBeenCalled();
    });
  });
});

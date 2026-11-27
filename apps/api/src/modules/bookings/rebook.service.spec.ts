/**
 * @file apps/api/src/modules/bookings/rebook.service.spec.ts
 * @feature bookings
 * @dependencies RebookService, @nestjs/testing
 */

import { ConflictException, Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type {
  BookingExtra,
  HouseAvailability,
  PaymentSummary,
  Quote,
  RebookRequest,
} from '@resort-booking/shared-types';
import { Client, type PoolClient } from 'pg';
import { AuditService } from '../../shared/audit/audit.service';
import { DatabaseService } from '../../shared/database/database.service';
import type { StaffAccount } from '../../shared/roles/staff-role';
import { DiscountsService } from '../discounts/discounts.service';
import { AvailabilityService } from '../inventory/availability.service';
import type { PriceSnapshot } from '../inventory/inventory.rules';
import { InventoryService, type QuoteOptions } from '../inventory/inventory.service';
import type { QuoteQueryDto } from '../inventory/dto/quote-query.dto';
import type { OpenRebookPaymentInput } from '../payments/payments.service';
import { PaymentsService } from '../payments/payments.service';
import type { RefundRequest, RefundResult } from '../payments/payment-provider';
import type { PolicySnapshot } from '../reservations/reservations.rules';
import { ReservationsService } from '../reservations/reservations.service';
import { BookingReader } from './booking-reader';
import {
  BookingsRepository,
  type BookingRow,
  type InsertChangeInput,
  type InsertRebookedBookingInput,
  type InsertRefundInput,
} from './bookings.repository';
import { RebookService } from './rebook.service';
import { DATES_TAKEN_MESSAGE, NO_CHANGE_MESSAGE, REBOOK_NOT_ALLOWED_MESSAGE } from './rebook.rules';
import { RefundIssuer } from './refund-issuer';
import { RefundTimings } from './refund-timings';

const ID = '1a2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d';
const NEW_ID = '9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a';
const REFERENCE = 'BK-1A2B3C4D5E';
const EMAIL = 'ada@example.com';
const TODAY = '2027-06-01';

const LADDER = [
  { minDaysBeforeCheckIn: 7, refundPercent: 100 },
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
    paid_cents: 96000,
    policy_snapshot: snapshot(),
    price_snapshot: null,
    rebook_of_id: null,
    replaced_by_id: null,
    payments: [{ id: 'pay-1', provider: 'mock', providerRef: 'mock_pi_abc', refundableCents: 96000 }],
    refund_id: null,
    refund_amount_cents: null,
    refund_percent: null,
    refund_status: null,
    refund_provider: null,
    refund_currency: null,
    ...overrides,
  };
}

function quoteFor(totalCents: number, overrides: Partial<Quote> = {}): Quote {
  return {
    houseId: 'house',
    checkIn: '2027-08-01',
    checkOut: '2027-08-04',
    guestCount: 2,
    nights: 3,
    nightlyRateCents: 20000,
    lines: [{ label: 'Standard rate', nights: 3, nightlyRateCents: totalCents / 3, subtotalCents: totalCents }],
    subtotalCents: totalCents,
    discounts: [],
    discountCents: 0,
    totalCents,
    currencyCode: 'EUR',
    available: true,
    promoCode: null,
    ...overrides,
  };
}

const NEW_DATES: RebookRequest = { reference: REFERENCE, email: EMAIL, newCheckIn: '2027-08-01', newCheckOut: '2027-08-04' };

const PRICE: PriceSnapshot = {
  lines: [{ label: 'Standard rate', nights: 3, nightlyRateCents: 20000, subtotalCents: 60000 }],
  subtotalCents: 60000,
  discounts: [{ discountId: 'long', label: 'Long stay', amountCents: 6000 }],
  discountCents: 6000,
  totalCents: 54000,
  currencyCode: 'EUR',
  promoCode: null,
};

function fakeClient(log: string[]): PoolClient {
  return Object.assign(new Client(), {
    release: (): void => undefined,
    query: (text: string): Promise<unknown> => {
      log.push(text);
      return Promise.resolve({ rows: [] });
    },
  });
}

describe('RebookService', () => {
  const findByReference = jest.fn<Promise<BookingRow[]>, [{ low: string; high: string }, string]>();
  const findById = jest.fn<Promise<BookingRow | null>, [string]>();
  const lockForCancel = jest.fn<Promise<'confirmed' | 'cancelled' | 'other' | null>, [PoolClient, string]>();
  const markCancelled = jest.fn<Promise<void>, [PoolClient, string]>();
  const insertRebookedBooking = jest.fn<Promise<string>, [PoolClient, InsertRebookedBookingInput]>();
  const copyRequests = jest.fn<Promise<void>, [PoolClient, string, string]>();
  const copyExtras = jest.fn<Promise<void>, [PoolClient, string, string]>();
  const listExtras = jest.fn<Promise<BookingExtra[]>, [string]>();
  const moveSucceededPayments = jest.fn<Promise<void>, [PoolClient, string, string]>();
  const insertRefund = jest.fn<Promise<string | null>, [PoolClient, InsertRefundInput]>();
  const insertChange = jest.fn<Promise<void>, [PoolClient, InsertChangeInput]>();
  const completeRefund = jest.fn<Promise<void>, [string, 'succeeded' | 'failed', string, string | null]>();
  const findBookingIdByChangePayment = jest.fn<Promise<string | null>, [string]>();
  const getQuote = jest.fn<Promise<Quote>, [QuoteQueryDto, boolean, QuoteOptions | undefined]>();
  const getStayAvailabilityExcluding = jest.fn<Promise<HouseAvailability>, [string, string, string]>();
  const describeProvider = jest.fn<{ name: string; simulated: boolean }, []>();
  const issueRefund = jest.fn<Promise<RefundResult>, [RefundRequest]>();
  const openRebookPayment = jest.fn<Promise<PaymentSummary>, [OpenRebookPaymentInput]>();
  const recordManualPayment = jest.fn<Promise<string>, [PoolClient, unknown]>();
  const recordInTransaction = jest.fn<Promise<void>, [PoolClient, { organizationId: string; staffUserId: string }, string, Record<string, unknown>?]>();
  const moveRedemptions = jest.fn<Promise<void>, [PoolClient, string, string, readonly unknown[]]>();
  const getPolicySnapshot = jest.fn<Promise<PolicySnapshot>, [string]>();
  let log: string[];
  let withClientCalls: number;
  let service: RebookService;

  const PAYMENT: PaymentSummary = {
    id: 'pay-new',
    holdId: ID,
    provider: 'mock',
    status: 'requires_payment',
    amountCents: 26000,
    currencyCode: 'EUR',
    simulated: true,
  };

  /** The old booking before a change, the new one after it. */
  function bookingAfterChange(): BookingRow {
    return row({
      id: NEW_ID,
      check_in: '2027-08-01',
      check_out: '2027-08-04',
      total_cents: 60000,
      paid_cents: 62000,
      rebook_of_id: ID,
    });
  }

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
    findById.mockImplementation((id) => Promise.resolve(id === NEW_ID ? bookingAfterChange() : row()));
    lockForCancel.mockImplementation(() => {
      log.push('lock');
      return Promise.resolve('confirmed');
    });
    markCancelled.mockImplementation(() => {
      log.push('markCancelled');
      return Promise.resolve();
    });
    insertRebookedBooking.mockImplementation(() => {
      log.push('insertRebookedBooking');
      return Promise.resolve(NEW_ID);
    });
    copyRequests.mockImplementation(() => {
      log.push('copyRequests');
      return Promise.resolve();
    });
    copyExtras.mockImplementation(() => {
      log.push('copyExtras');
      return Promise.resolve();
    });
    listExtras.mockResolvedValue([]);
    moveSucceededPayments.mockImplementation(() => {
      log.push('movePayments');
      return Promise.resolve();
    });
    moveRedemptions.mockImplementation(() => {
      log.push('moveRedemptions');
      return Promise.resolve();
    });
    insertRefund.mockImplementation(() => {
      log.push('insertRefund');
      return Promise.resolve('refund-1');
    });
    insertChange.mockImplementation(() => {
      log.push('insertChange');
      return Promise.resolve();
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
    getQuote.mockResolvedValue(quoteFor(60000));
    getStayAvailabilityExcluding.mockResolvedValue({ houseId: 'house', from: TODAY, to: '2028-06-01', unavailable: [], maxCheckOutDate: null });
    openRebookPayment.mockResolvedValue(PAYMENT);
    getPolicySnapshot.mockResolvedValue(snapshot({ rebookable: true, rebookFeeType: 'none', rebookFeeValue: 0 }));
    findBookingIdByChangePayment.mockResolvedValue(NEW_ID);
    recordManualPayment.mockResolvedValue('manual-pay');
    recordInTransaction.mockImplementation(() => {
      log.push('audit');
      return Promise.resolve();
    });

    const moduleRef = await Test.createTestingModule({
      providers: [
        RebookService,
        BookingReader,
        RefundIssuer,
        { provide: RefundTimings, useValue: { values: { providerTimeoutMs: 20_000, leaseSeconds: 150 } } },
        {
          provide: BookingsRepository,
          useValue: {
            findByReference,
            findById,
            lockForCancel,
            markCancelled,
            insertRebookedBooking,
            copyRequests,
            copyExtras,
            listExtras,
            moveSucceededPayments,
            insertRefund,
            insertChange,
            completeRefund,
            findBookingIdByChangePayment,
          },
        },
        { provide: InventoryService, useValue: { getQuote } },
        { provide: AvailabilityService, useValue: { getStayAvailabilityExcluding } },
        { provide: PaymentsService, useValue: { describeProvider, issueRefund, openRebookPayment, recordManualPayment } },
        { provide: DiscountsService, useValue: { moveRedemptions } },
        { provide: ReservationsService, useValue: { getPolicySnapshot } },
        { provide: AuditService, useValue: { recordInTransaction } },
        {
          provide: DatabaseService,
          useValue: {
            withClient: (work: (client: PoolClient) => Promise<unknown>) => {
              withClientCalls += 1;
              return work(fakeClient(log));
            },
          },
        },
      ],
    }).compile();
    service = moduleRef.get(RebookService);
  });

  afterEach((): void => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  describe('availabilityFor', () => {
    it('shows the taken nights of this stay with the booking\'s own row left out', async () => {
      await service.availabilityFor({ reference: REFERENCE, email: EMAIL });

      expect(getStayAvailabilityExcluding).toHaveBeenCalledWith('house', 'Europe/Paris', ID);
    });

    it('is refused when the policy saved with the booking does not allow changes', async () => {
      findByReference.mockResolvedValue([row({ policy_snapshot: snapshot({ rebookable: false }) })]);

      await expect(service.availabilityFor({ reference: REFERENCE, email: EMAIL })).rejects.toMatchObject({
        response: { code: 'REBOOK_NOT_ALLOWED' },
      });
      expect(getStayAvailabilityExcluding).not.toHaveBeenCalled();
    });

    it('gives the same 404 for a wrong email, without looking at any dates', async () => {
      findByReference.mockResolvedValue([]);

      await expect(service.availabilityFor({ reference: REFERENCE, email: 'someone@else.com' })).rejects.toMatchObject({
        response: { code: 'BOOKING_NOT_FOUND' },
      });
      expect(getStayAvailabilityExcluding).not.toHaveBeenCalled();
    });
  });

  describe('quote: the numbers', () => {
    it('longer stay: the guest pays the difference plus the fee', async () => {
      getQuote.mockResolvedValue(quoteFor(120000, { nights: 5 }));

      const quote = await service.quote(NEW_DATES);

      expect(quote).toMatchObject({
        reference: REFERENCE,
        newCheckIn: '2027-08-01',
        newCheckOut: '2027-08-04',
        nights: 5,
        currencyCode: 'EUR',
        newTotalCents: 120000,
        feeCents: 2000,
        paidCents: 96000,
        balanceCents: 26000,
        payCents: 26000,
        refundCents: 0,
        available: true,
        problem: null,
      });
    });

    it('shorter stay: the guest gets the difference back, less the fee', async () => {
      getQuote.mockResolvedValue(quoteFor(60000));

      const quote = await service.quote(NEW_DATES);

      expect(quote).toMatchObject({ newTotalCents: 60000, feeCents: 2000, balanceCents: -34000, payCents: 0, refundCents: 34000 });
    });

    it('same total, no fee: nothing moves', async () => {
      findByReference.mockResolvedValue([row({ policy_snapshot: snapshot({ rebookFeeType: 'none', rebookFeeValue: 0 }) })]);
      getQuote.mockResolvedValue(quoteFor(96000));

      const quote = await service.quote(NEW_DATES);

      expect(quote).toMatchObject({ feeCents: 0, balanceCents: 0, payCents: 0, refundCents: 0 });
    });

    it('same total with a fee: only the fee is charged', async () => {
      getQuote.mockResolvedValue(quoteFor(96000));

      const quote = await service.quote(NEW_DATES);

      expect(quote).toMatchObject({ feeCents: 2000, balanceCents: 2000, payCents: 2000, refundCents: 0 });
    });

    it('a percent fee is a share of what has been paid so far', async () => {
      findByReference.mockResolvedValue([row({ paid_cents: 50000, policy_snapshot: snapshot({ rebookFeeType: 'percent', rebookFeeValue: 10 }) })]);
      getQuote.mockResolvedValue(quoteFor(60000));

      const quote = await service.quote(NEW_DATES);

      expect(quote).toMatchObject({ paidCents: 50000, feeCents: 5000, payCents: 15000 });
    });

    it('uses the booking total when nothing is recorded as paid', async () => {
      findByReference.mockResolvedValue([row({ paid_cents: null })]);

      const quote = await service.quote(NEW_DATES);

      expect(quote.paidCents).toBe(96000);
    });

    it('passes the price lines and discounts of the new dates through', async () => {
      getQuote.mockResolvedValue(
        quoteFor(54000, {
          subtotalCents: 60000,
          discounts: [{ discountId: 'long', label: 'Long stay', amountCents: 6000 }],
          discountCents: 6000,
        }),
      );

      const quote = await service.quote(NEW_DATES);

      expect(quote).toMatchObject({ subtotalCents: 60000, discountCents: 6000, newTotalCents: 54000 });
      expect(quote.discounts).toEqual([{ discountId: 'long', label: 'Long stay', amountCents: 6000 }]);
      expect(quote.lines).toHaveLength(1);
    });

    it('never writes anything', async () => {
      await service.quote(NEW_DATES);

      expect(withClientCalls).toBe(0);
      expect(openRebookPayment).not.toHaveBeenCalled();
      expect(insertRebookedBooking).not.toHaveBeenCalled();
    });
  });

  describe('quote: the new dates and the calendar', () => {
    it('prices the new nights with the booking\'s own dates counted as free, so shifting by a day works', async () => {
      await service.quote({ ...NEW_DATES, newCheckIn: '2027-07-11', newCheckOut: '2027-07-14' });

      expect(getQuote).toHaveBeenCalledWith(
        expect.objectContaining({ houseId: 'house', checkIn: '2027-07-11', checkOut: '2027-07-14', guestCount: 2 }),
        true,
        { excludeHoldId: ID },
      );
    });

    it('says the dates are taken, with the numbers still filled in (never throws for a taken range)', async () => {
      getQuote.mockResolvedValue(quoteFor(60000, { available: false }));

      const quote = await service.quote(NEW_DATES);

      expect(quote).toMatchObject({ available: false, problem: DATES_TAKEN_MESSAGE, newTotalCents: 60000, refundCents: 34000 });
    });

    it('says "those are your current dates" for no change, still returning a priced quote', async () => {
      const quote = await service.quote({ ...NEW_DATES, newCheckIn: '2027-07-10', newCheckOut: '2027-07-13' });

      expect(quote).toMatchObject({ available: false, problem: NO_CHANGE_MESSAGE });
    });

    it('refuses a new check-in in the past with a clear code', async () => {
      await expect(service.quote({ ...NEW_DATES, newCheckIn: '2027-05-30', newCheckOut: '2027-06-03' })).rejects.toMatchObject({
        response: { code: 'PAST_CHECK_IN' },
      });
      expect(getQuote).not.toHaveBeenCalled();
    });

    it('refuses an impossible range with a clear code', async () => {
      await expect(service.quote({ ...NEW_DATES, newCheckIn: '2027-08-05', newCheckOut: '2027-08-01' })).rejects.toMatchObject({
        response: { code: 'INVALID_DATES' },
      });
      expect(getQuote).not.toHaveBeenCalled();
    });

    it('judges "today" in the property timezone, not the server\'s', async () => {
      // 23:30 UTC on 1 June is already 2 June in Paris: a 1 June check-in is in the past there.
      jest.setSystemTime(new Date('2027-06-01T23:30:00Z'));

      await expect(service.quote({ ...NEW_DATES, newCheckIn: '2027-06-01', newCheckOut: '2027-06-03' })).rejects.toMatchObject({
        response: { code: 'PAST_CHECK_IN' },
      });
    });
  });

  describe('quote: the promo code', () => {
    const withPromo = (applied: boolean): PriceSnapshot => ({
      ...PRICE,
      promoCode: { code: 'WELCOME15', applied, message: applied ? 'Code WELCOME15 applied' : 'That code is not valid' },
    });

    it('tries the promo code the booking used again on the new dates', async () => {
      findByReference.mockResolvedValue([row({ price_snapshot: withPromo(true) })]);

      await service.quote(NEW_DATES);

      expect(getQuote).toHaveBeenCalledWith(expect.objectContaining({ promoCode: 'WELCOME15' }), true, expect.anything());
    });

    it('does not send a code that never applied', async () => {
      findByReference.mockResolvedValue([row({ price_snapshot: withPromo(false) })]);

      await service.quote(NEW_DATES);

      expect(getQuote.mock.calls[0]?.[0]).not.toHaveProperty('promoCode');
    });

    it('reports what happened to the code on the new dates, and prices without it if it no longer applies', async () => {
      findByReference.mockResolvedValue([row({ price_snapshot: withPromo(true) })]);
      getQuote.mockResolvedValue(quoteFor(60000, { promoCode: { code: 'WELCOME15', applied: false, message: 'This code does not apply to these dates' } }));

      const quote = await service.quote(NEW_DATES);

      expect(quote.promoCode).toEqual({ code: 'WELCOME15', applied: false, message: 'This code does not apply to these dates' });
      expect(quote.discountCents).toBe(0);
    });
  });

  describe('who may change dates', () => {
    it('refuses by the policy SAVED with the booking even if today\'s policy would allow it', async () => {
      findByReference.mockResolvedValue([row({ policy_snapshot: snapshot({ rebookable: false }) })]);
      getPolicySnapshot.mockResolvedValue(snapshot({ rebookable: true }));

      const attempt = service.quote(NEW_DATES);

      await expect(attempt).rejects.toBeInstanceOf(ConflictException);
      await expect(attempt).rejects.toMatchObject({ response: { code: 'REBOOK_NOT_ALLOWED', message: REBOOK_NOT_ALLOWED_MESSAGE } });
      expect(getPolicySnapshot).not.toHaveBeenCalled();
    });

    it('refuses a pay-at-hotel booking nothing was paid for, for a guest and for staff, in each one\'s words', async () => {
      const pending = row({ payment_method: 'pay_at_hotel', payment_status: 'pending', paid_cents: 0 });
      findByReference.mockResolvedValue([pending]);

      await expect(service.quote(NEW_DATES)).rejects.toMatchObject({
        response: { code: 'PAYMENT_PENDING', message: expect.stringContaining('contact the property') as string },
      });
      await expect(
        service.staffQuote(pending, { newCheckIn: '2027-08-01', newCheckOut: '2027-08-04', waiveFee: false }),
      ).rejects.toMatchObject({ response: { code: 'PAYMENT_PENDING', message: expect.stringContaining('Mark it as paid first') as string } });
    });

    it('refuses a booking that has started', async () => {
      findByReference.mockResolvedValue([row({ check_in: '2027-05-30', check_out: '2027-06-03' })]);

      await expect(service.quote(NEW_DATES)).rejects.toMatchObject({ response: { code: 'BOOKING_ALREADY_STARTED' } });
    });

    it('refuses a cancelled booking', async () => {
      findByReference.mockResolvedValue([row({ status: 'cancelled' })]);

      await expect(service.rebook(NEW_DATES)).rejects.toMatchObject({ response: { code: 'BOOKING_CANCELLED' } });
      expect(withClientCalls).toBe(0);
    });

    it('falls back to the current policy for an older booking with no saved one', async () => {
      findByReference.mockResolvedValue([row({ policy_snapshot: null })]);

      const quote = await service.quote(NEW_DATES);

      expect(getPolicySnapshot).toHaveBeenCalledWith('prop');
      expect(quote.feeCents).toBe(0);
    });

    it('gives the SAME 404 for a wrong email, a wrong reference, and an ambiguous one', async () => {
      const messages: string[] = [];
      const attempts: Array<() => Promise<unknown>> = [
        () => service.rebook({ ...NEW_DATES, reference: 'nonsense' }),
        () => {
          findByReference.mockResolvedValueOnce([]);
          return service.rebook(NEW_DATES);
        },
        () => {
          findByReference.mockResolvedValueOnce([row(), row({ id: '1a2b3c4d-5e11-4a8b-9c0d-1e2f3a4b5c6d' })]);
          return service.rebook(NEW_DATES);
        },
      ];
      for (const attempt of attempts) {
        const failure = await attempt().catch((error: unknown) => error);
        messages.push(JSON.stringify((failure as { getResponse: () => unknown }).getResponse()));
      }

      expect(new Set(messages).size).toBe(1);
      expect(messages[0]).toContain('BOOKING_NOT_FOUND');
      expect(withClientCalls).toBe(0);
    });
  });

  describe('rebook: a booking with extras (they ride along at their saved prices)', () => {
    // 96000 paid in all: the stay was 90000 and two priced extras added 6000. One free request rides along too.
    const BREAKFAST: BookingExtra = {
      id: 'ex-1',
      extraServiceId: 'svc-1',
      name: 'Breakfast',
      kind: 'instant',
      quantity: 2,
      unitPriceCents: 3000,
      lineCents: 6000,
      currencyCode: 'EUR',
      status: 'confirmed',
    };
    const DINNER: BookingExtra = {
      id: 'ex-2',
      extraServiceId: 'svc-2',
      name: 'Private dinner',
      kind: 'on_request',
      quantity: 1,
      unitPriceCents: 9000,
      lineCents: 0,
      currencyCode: 'EUR',
      status: 'pending',
    };

    beforeEach(() => {
      listExtras.mockResolvedValue([BREAKFAST, DINNER]);
    });

    it('is not refused: the quote is for the new stay plus the same extras, shown as their own line', async () => {
      getQuote.mockResolvedValue(quoteFor(90000));

      const quote = await service.quote(NEW_DATES);

      expect(quote).toMatchObject({ extrasCents: 6000, newTotalCents: 96000, paidCents: 96000, feeCents: 2000, balanceCents: 2000, payCents: 2000, refundCents: 0 });
      expect(quote.extras).toEqual([BREAKFAST, DINNER]);
    });

    it('prices the extras from the booking, never from the property\'s current prices', async () => {
      getQuote.mockResolvedValue(quoteFor(90000));

      await service.quote(NEW_DATES);

      expect(listExtras).toHaveBeenCalledWith(ID);
      // The only price lookup is the stay itself; no extras catalog is read.
      expect(getQuote).toHaveBeenCalledTimes(1);
    });

    it('new stay cheaper than the old: the guest gets the difference back (the extras stay paid)', async () => {
      getQuote.mockResolvedValue(quoteFor(60000));

      const quote = await service.quote(NEW_DATES);
      const result = await service.rebook(NEW_DATES);

      // new total 60000 + 6000 = 66000, fee 2000, paid 96000 -> 28000 back
      expect(quote).toMatchObject({ newTotalCents: 66000, balanceCents: -28000, payCents: 0, refundCents: 28000 });
      expect(insertRefund).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ kind: 'rebook_difference', amountCents: 28000 }));
      expect(result.outcome).toBe('changed');
      const input = insertRebookedBooking.mock.calls[0]?.[1];
      expect(input).toMatchObject({ totalCents: 66000, paidCents: 68000 });
      expect(JSON.parse(input?.priceSnapshot ?? '{}')).toMatchObject({ totalCents: 60000, extrasCents: 6000, rebookFeeCents: 2000 });
      expect(copyExtras).toHaveBeenCalledWith(expect.anything(), ID, NEW_ID);
    });

    it('new stay dearer than the old: the guest pays only the difference, and the payment keeps the extras with it', async () => {
      getQuote.mockResolvedValue(quoteFor(120000));

      const quote = await service.quote(NEW_DATES);
      const result = await service.rebook(NEW_DATES);

      // new total 120000 + 6000 = 126000, fee 2000, paid 96000 -> 32000 more
      expect(quote).toMatchObject({ newTotalCents: 126000, payCents: 32000, refundCents: 0 });
      expect(result.outcome).toBe('payment_required');
      expect(openRebookPayment).toHaveBeenCalledWith(expect.objectContaining({ amountCents: quote.payCents }));
      expect(openRebookPayment.mock.calls[0]?.[0].payload).toMatchObject({ newTotalCents: 126000, extrasCents: 6000, feeCents: 2000 });
      expect(insertRebookedBooking).not.toHaveBeenCalled();
    });

    it('new stay the same price as the old: only the fee moves', async () => {
      getQuote.mockResolvedValue(quoteFor(90000));
      listExtras.mockResolvedValue([BREAKFAST]);
      findByReference.mockResolvedValue([row({ policy_snapshot: snapshot({ rebookFeeType: 'none', rebookFeeValue: 0 }) })]);

      const quote = await service.quote(NEW_DATES);
      const result = await service.rebook(NEW_DATES);

      expect(quote).toMatchObject({ newTotalCents: 96000, feeCents: 0, balanceCents: 0, payCents: 0, refundCents: 0 });
      expect(result.outcome).toBe('changed');
      expect(insertRefund).not.toHaveBeenCalled();
      expect(insertRebookedBooking.mock.calls[0]?.[1]).toMatchObject({ totalCents: 96000, paidCents: 96000 });
    });

    it('the quote and the confirmed change agree to the cent (what was shown is what is charged)', async () => {
      getQuote.mockResolvedValue(quoteFor(120000));

      const quote = await service.quote(NEW_DATES);
      await service.rebook(NEW_DATES);
      const payload = openRebookPayment.mock.calls[0]?.[0].payload as { newTotalCents: number; feeCents: number; extrasCents: number };
      const opened = openRebookPayment.mock.calls[0]?.[0];

      expect(opened?.amountCents).toBe(quote.payCents);
      expect(payload.newTotalCents).toBe(quote.newTotalCents);
      expect(payload.feeCents).toBe(quote.feeCents);
      expect(payload.extrasCents).toBe(quote.extrasCents);
      // Once the payment settles, the new booking holds exactly the quoted total.
      await service.applySettledChange(fakeClient(log), { id: 'pay-new', bookingId: ID, amountCents: quote.payCents, currencyCode: 'EUR', payload });
      expect(insertRebookedBooking.mock.calls[0]?.[1]).toMatchObject({ totalCents: quote.newTotalCents, paidCents: quote.newTotalCents + quote.feeCents });
    });

    it('a percent fee is still a share of what was paid (extras included), as for cancelling', async () => {
      getQuote.mockResolvedValue(quoteFor(90000));
      findByReference.mockResolvedValue([row({ policy_snapshot: snapshot({ rebookFeeType: 'percent', rebookFeeValue: 10 }) })]);

      const quote = await service.quote(NEW_DATES);

      expect(quote.feeCents).toBe(9600);
    });

    it('still refuses a pay-at-hotel booking nobody has paid for, extras or not', async () => {
      findByReference.mockResolvedValue([row({ payment_status: 'pending', paid_cents: 0 })]);

      await expect(service.quote(NEW_DATES)).rejects.toMatchObject({ status: 409, response: { code: 'PAYMENT_PENDING' } });
    });

    it('an in-flight payment opened before extras could ride along still settles (no extrasCents means 0)', async () => {
      const payload = { oldBookingId: ID, newCheckIn: '2027-08-01', newCheckOut: '2027-08-04', newTotalCents: 120000, feeCents: 2000, priceSnapshot: { ...PRICE, totalCents: 120000 } };

      await service.applySettledChange(fakeClient(log), { id: 'pay-new', bookingId: ID, amountCents: 26000, currencyCode: 'EUR', payload });

      expect(JSON.parse(insertRebookedBooking.mock.calls[0]?.[1].priceSnapshot ?? '{}')).toMatchObject({ extrasCents: 0 });
    });
  });

  describe('rebook: changing now (the guest owes nothing more)', () => {
    it('does the whole swap in ONE transaction, in the right order', async () => {
      await service.rebook(NEW_DATES);

      expect(withClientCalls).toBe(1);
      expect(log.slice(0, log.indexOf('COMMIT') + 1)).toEqual([
        'BEGIN',
        'lock',
        'markCancelled',
        'insertRebookedBooking',
        'copyRequests',
        'copyExtras',
        'movePayments',
        'moveRedemptions',
        'insertRefund',
        'insertChange',
        'COMMIT',
      ]);
    });

    it('cancels the old booking BEFORE creating the new one, so overlapping dates cannot clash with themselves', async () => {
      await service.rebook({ ...NEW_DATES, newCheckIn: '2027-07-11', newCheckOut: '2027-07-14' });

      expect(log.indexOf('markCancelled')).toBeLessThan(log.indexOf('insertRebookedBooking'));
    });

    it('creates the new booking holding exactly its price plus the fee, with the price lines the guest was quoted', async () => {
      await service.rebook(NEW_DATES);

      const input = insertRebookedBooking.mock.calls[0]?.[1];
      expect(input).toMatchObject({ oldBookingId: ID, newCheckIn: '2027-08-01', newCheckOut: '2027-08-04', totalCents: 60000, paidCents: 62000 });
      expect(JSON.parse(input?.priceSnapshot ?? '{}')).toMatchObject({ totalCents: 60000, rebookFeeCents: 2000, currencyCode: 'EUR' });
    });

    it('gives the difference back: records it against the new booking as a date-change refund, then asks the provider', async () => {
      const result = await service.rebook(NEW_DATES);

      expect(insertRefund).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ bookingId: NEW_ID, kind: 'rebook_difference', amountCents: 34000, percent: 100, status: 'pending', provider: 'mock', paymentId: 'pay-1' }),
      );
      expect(issueRefund).toHaveBeenCalledWith(expect.objectContaining({ providerRef: 'mock_pi_abc', amountCents: 34000 }));
      expect(log.indexOf('COMMIT')).toBeLessThan(log.indexOf('providerRefund'));
      expect(completeRefund).toHaveBeenCalledWith('refund-1', 'succeeded', 'mock_re_1', null, {});
      expect(result).toMatchObject({
        outcome: 'changed',
        payment: null,
        refund: { amountCents: 34000, percent: 100, status: 'succeeded', simulated: true, currencyCode: 'EUR' },
      });
    });

    it('returns the NEW booking, with its own reference', async () => {
      const result = await service.rebook(NEW_DATES);

      expect(result.booking).toMatchObject({ reservationId: NEW_ID, reference: 'BK-9F8E7D6C5B', checkIn: '2027-08-01', checkOut: '2027-08-04', status: 'confirmed' });
    });

    it('records the audit trail with the money that moved', async () => {
      await service.rebook(NEW_DATES);

      expect(insertChange).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          oldBookingId: ID,
          newBookingId: NEW_ID,
          paymentId: null,
          oldCheckIn: '2027-07-10',
          oldCheckOut: '2027-07-13',
          newCheckIn: '2027-08-01',
          newCheckOut: '2027-08-04',
          oldTotalCents: 96000,
          newTotalCents: 60000,
          feeCents: 2000,
          payCents: 0,
          refundCents: 34000,
        }),
      );
    });

    it('moves the payments, the guest\'s requests, and discount use to the new booking', async () => {
      getQuote.mockResolvedValue(quoteFor(54000, { discounts: PRICE.discounts, discountCents: 6000, subtotalCents: 60000 }));

      await service.rebook(NEW_DATES);

      expect(copyRequests).toHaveBeenCalledWith(expect.anything(), ID, NEW_ID);
      expect(copyExtras).toHaveBeenCalledWith(expect.anything(), ID, NEW_ID);
      expect(moveSucceededPayments).toHaveBeenCalledWith(expect.anything(), ID, NEW_ID);
      expect(moveRedemptions).toHaveBeenCalledWith(expect.anything(), ID, NEW_ID, PRICE.discounts);
    });

    it('with an equal total and no fee: changes the dates and moves no money at all', async () => {
      findByReference.mockResolvedValue([row({ policy_snapshot: snapshot({ rebookFeeType: 'none', rebookFeeValue: 0 }) })]);
      getQuote.mockResolvedValue(quoteFor(96000));

      const result = await service.rebook(NEW_DATES);

      expect(result).toMatchObject({ outcome: 'changed', payment: null, refund: null });
      expect(insertRefund).not.toHaveBeenCalled();
      expect(issueRefund).not.toHaveBeenCalled();
      expect(openRebookPayment).not.toHaveBeenCalled();
      expect(insertRebookedBooking.mock.calls[0]?.[1].paidCents).toBe(96000);
    });

    it('leaves a refund for the operator when there is no online payment on record', async () => {
      findByReference.mockResolvedValue([row({ payments: [] })]);

      const result = await service.rebook(NEW_DATES);

      expect(insertRefund).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ provider: 'manual', status: 'pending', paymentId: null, amountCents: 34000 }));
      expect(issueRefund).not.toHaveBeenCalled();
      expect(result.refund).toMatchObject({ status: 'pending', simulated: false });
    });

    it('keeps the change when the provider cannot refund, and says the refund failed', async () => {
      issueRefund.mockImplementation(() => {
        log.push('providerRefund');
        return Promise.reject(new Error('provider unreachable'));
      });

      const result = await service.rebook(NEW_DATES);

      expect(log).toContain('COMMIT');
      expect(completeRefund).toHaveBeenCalledWith('refund-1', 'failed', '', 'provider unreachable', { bumpKeyGeneration: true });
      expect(result.outcome).toBe('changed');
      expect(result.refund).toMatchObject({ amountCents: 34000, status: 'failed' });
      expect(Logger.prototype.error).toHaveBeenCalled();
    });

    it('refunds across two payments when a booking was paid twice', async () => {
      findByReference.mockResolvedValue([
        row({
          payments: [
            { id: 'pay-2', provider: 'mock', providerRef: 'mock_pi_2', refundableCents: 20000 },
            { id: 'pay-1', provider: 'mock', providerRef: 'mock_pi_1', refundableCents: 96000 },
          ],
        }),
      ]);
      getQuote.mockResolvedValue(quoteFor(30000));

      await service.rebook(NEW_DATES);

      expect(issueRefund.mock.calls.map((call) => [call[0].providerRef, call[0].amountCents])).toEqual([
        ['mock_pi_2', 20000],
        ['mock_pi_1', 44000],
      ]);
    });
  });

  describe('rebook: refusals leave everything as it was', () => {
    it('is a 409 for dates that are taken, and writes nothing', async () => {
      getQuote.mockResolvedValue(quoteFor(60000, { available: false }));

      await expect(service.rebook(NEW_DATES)).rejects.toMatchObject({ response: { code: 'DATES_UNAVAILABLE' } });

      expect(withClientCalls).toBe(0);
      expect(openRebookPayment).not.toHaveBeenCalled();
    });

    it('is a 409 NO_CHANGE for the same dates', async () => {
      await expect(service.rebook({ ...NEW_DATES, newCheckIn: '2027-07-10', newCheckOut: '2027-07-13' })).rejects.toMatchObject({
        response: { code: 'NO_CHANGE', message: NO_CHANGE_MESSAGE },
      });
      expect(withClientCalls).toBe(0);
    });

    it('rolls EVERYTHING back if the new dates are taken in the last moment (the database refuses the overlap)', async () => {
      insertRebookedBooking.mockImplementation(() => Promise.reject(Object.assign(new Error('overlap'), { code: '23P01' })));

      await expect(service.rebook(NEW_DATES)).rejects.toMatchObject({ response: { code: 'DATES_UNAVAILABLE' } });

      expect(log).toContain('ROLLBACK');
      expect(log).not.toContain('COMMIT');
      expect(issueRefund).not.toHaveBeenCalled();
      expect(insertChange).not.toHaveBeenCalled();
    });

    it('rethrows an unexpected database error instead of calling it "dates taken"', async () => {
      insertRebookedBooking.mockRejectedValue(new Error('disk full'));

      await expect(service.rebook(NEW_DATES)).rejects.toThrow('disk full');
      expect(log).toContain('ROLLBACK');
    });

    it('refuses if the booking was cancelled a moment ago, after taking the lock', async () => {
      lockForCancel.mockResolvedValue('cancelled');

      await expect(service.rebook(NEW_DATES)).rejects.toMatchObject({ response: { code: 'BOOKING_CANCELLED' } });

      expect(markCancelled).not.toHaveBeenCalled();
      expect(insertRebookedBooking).not.toHaveBeenCalled();
      expect(log).toContain('ROLLBACK');
    });

    it('is a 404 if the booking vanished before the lock', async () => {
      lockForCancel.mockResolvedValue(null);

      await expect(service.rebook(NEW_DATES)).rejects.toMatchObject({ response: { code: 'BOOKING_NOT_FOUND' } });
      expect(markCancelled).not.toHaveBeenCalled();
    });
  });

  describe('rebook: the guest owes more', () => {
    beforeEach(() => {
      getQuote.mockResolvedValue(quoteFor(120000, { nights: 5, discounts: PRICE.discounts, discountCents: 6000, subtotalCents: 126000 }));
    });

    it('changes NOTHING yet: it opens a balance payment for exactly what is owed', async () => {
      const result = await service.rebook(NEW_DATES);

      expect(withClientCalls).toBe(0);
      expect(insertRebookedBooking).not.toHaveBeenCalled();
      expect(markCancelled).not.toHaveBeenCalled();
      expect(openRebookPayment).toHaveBeenCalledTimes(1);
      expect(openRebookPayment).toHaveBeenCalledWith(
        expect.objectContaining({ bookingId: ID, organizationId: 'org', propertyId: 'prop', amountCents: 26000, currencyCode: 'EUR' }),
      );
      expect(result).toMatchObject({ outcome: 'payment_required', payment: PAYMENT, refund: null });
    });

    it('keeps the agreed change with the payment, so the guest gets exactly what they were quoted', async () => {
      await service.rebook(NEW_DATES);

      expect(openRebookPayment.mock.calls[0]?.[0].payload).toMatchObject({
        oldBookingId: ID,
        newCheckIn: '2027-08-01',
        newCheckOut: '2027-08-04',
        newTotalCents: 120000,
        feeCents: 2000,
        priceSnapshot: { totalCents: 120000, discountCents: 6000 },
      });
    });

    it('returns the CURRENT booking, unchanged, with its old dates', async () => {
      const result = await service.rebook(NEW_DATES);

      expect(result.booking).toMatchObject({ reservationId: ID, checkIn: '2027-07-10', checkOut: '2027-07-13', status: 'confirmed' });
    });

    it('asks for the very same payment when the guest repeats the request', async () => {
      const first = await service.rebook(NEW_DATES);
      const second = await service.rebook(NEW_DATES);

      expect(second.payment).toEqual(first.payment);
      expect(openRebookPayment.mock.calls[0]?.[0]).toEqual(openRebookPayment.mock.calls[1]?.[0]);
    });

    it('for a fee-only change, opens a payment for just the fee', async () => {
      getQuote.mockResolvedValue(quoteFor(96000));

      await service.rebook(NEW_DATES);

      expect(openRebookPayment).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 2000 }));
    });
  });

  describe('applySettledChange: the balance payment succeeded', () => {
    const PAYLOAD = {
      oldBookingId: ID,
      newCheckIn: '2027-08-01',
      newCheckOut: '2027-08-04',
      newTotalCents: 120000,
      feeCents: 2000,
      priceSnapshot: { ...PRICE, totalCents: 120000 },
    };
    const SETTLING = { id: 'pay-new', bookingId: ID, amountCents: 26000, currencyCode: 'EUR', payload: PAYLOAD };

    it('applies the change inside the payment\'s own transaction (it does not open another)', async () => {
      const client = fakeClient(log);

      await service.applySettledChange(client, SETTLING);

      expect(withClientCalls).toBe(0);
      expect(log).toEqual(['lock', 'markCancelled', 'insertRebookedBooking', 'copyRequests', 'copyExtras', 'movePayments', 'moveRedemptions', 'insertChange']);
      expect(log).not.toContain('BEGIN');
      expect(log).not.toContain('COMMIT');
    });

    it('creates the new booking with what the guest agreed to, now fully paid', async () => {
      await service.applySettledChange(fakeClient(log), SETTLING);

      expect(insertRebookedBooking.mock.calls[0]?.[1]).toMatchObject({ newCheckIn: '2027-08-01', newCheckOut: '2027-08-04', totalCents: 120000, paidCents: 122000 });
      expect(insertChange).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ paymentId: 'pay-new', payCents: 26000, refundCents: 0, feeCents: 2000 }));
      expect(insertRefund).not.toHaveBeenCalled();
    });

    it('refuses, and so rolls the payment back, if the new dates were taken while the guest paid', async () => {
      insertRebookedBooking.mockRejectedValue(Object.assign(new Error('overlap'), { code: '23P01' }));

      await expect(service.applySettledChange(fakeClient(log), SETTLING)).rejects.toMatchObject({ response: { code: 'DATES_UNAVAILABLE' } });

      expect(insertChange).not.toHaveBeenCalled();
    });

    it('refuses if the booking was cancelled meanwhile', async () => {
      lockForCancel.mockResolvedValue('cancelled');

      await expect(service.applySettledChange(fakeClient(log), SETTLING)).rejects.toMatchObject({ response: { code: 'BOOKING_CANCELLED' } });
      expect(insertRebookedBooking).not.toHaveBeenCalled();
    });

    it('refuses if the booking has started while the guest paid', async () => {
      findById.mockResolvedValue(row({ check_in: '2027-05-30', check_out: '2027-06-03' }));

      await expect(service.applySettledChange(fakeClient(log), SETTLING)).rejects.toMatchObject({ response: { code: 'BOOKING_ALREADY_STARTED' } });
    });

    it('refuses if the policy saved with the booking does not allow changes', async () => {
      findById.mockResolvedValue(row({ policy_snapshot: snapshot({ rebookable: false }) }));

      await expect(service.applySettledChange(fakeClient(log), SETTLING)).rejects.toMatchObject({ response: { code: 'REBOOK_NOT_ALLOWED' } });
    });

    it('refuses if the amount no longer matches what the booking owes, rather than guess', async () => {
      await expect(service.applySettledChange(fakeClient(log), { ...SETTLING, amountCents: 20000 })).rejects.toMatchObject({
        response: { code: 'BOOKING_CHANGED' },
      });
      expect(insertRebookedBooking).not.toHaveBeenCalled();
    });

    it('refuses a damaged payload, so a bad row can never change a booking', async () => {
      await expect(service.applySettledChange(fakeClient(log), { ...SETTLING, payload: { oldBookingId: ID } })).rejects.toMatchObject({
        response: { code: 'REBOOK_PAYLOAD_INVALID' },
      });
      expect(lockForCancel).not.toHaveBeenCalled();
    });

    it('is a 404 if the booking no longer exists', async () => {
      findById.mockResolvedValue(null);

      await expect(service.applySettledChange(fakeClient(log), SETTLING)).rejects.toMatchObject({ response: { code: 'BOOKING_NOT_FOUND' } });
    });
  });

  describe('presentSettled', () => {
    it('shows the new booking a settled balance payment produced', async () => {
      const booking = await service.presentSettled('pay-new');

      expect(booking).toMatchObject({ reservationId: NEW_ID, checkIn: '2027-08-01' });
      expect(findBookingIdByChangePayment).toHaveBeenCalledWith('pay-new');
    });

    it('is null when no change was produced by that payment', async () => {
      findBookingIdByChangePayment.mockResolvedValue(null);

      await expect(service.presentSettled('pay-x')).resolves.toBeNull();
    });
  });

  it('exposes only the guest fields in a result (no email, no phone)', async () => {
    const result = await service.rebook(NEW_DATES);

    expect(JSON.stringify(result)).not.toContain(EMAIL);
    expect(JSON.stringify(result)).not.toContain('+33612345678');
  });
  describe('staff: changing dates for a guest', () => {
    const STAFF: StaffAccount = { id: 'staff-1', organizationId: 'org', fullName: 'Sam Owner', email: 'sam@example.com', role: 'admin', organizationName: 'Humphreys', canManageRefunds: true };
    const STAFF_DATES = { newCheckIn: '2027-08-01', newCheckOut: '2027-08-04', waiveFee: false };
    const STAFF_CHANGE = { ...STAFF_DATES, note: 'Guest called to ask', balanceSettledOutside: false };

    it('quotes even when the policy does not let guests change dates', async () => {
      const quote = await service.staffQuote(row({ policy_snapshot: snapshot({ rebookable: false }) }), STAFF_DATES);

      expect(quote).toMatchObject({ newCheckIn: '2027-08-01', newTotalCents: 60000, feeCents: 2000 });
    });

    it('charges no fee when staff waive it', async () => {
      const quote = await service.staffQuote(row(), { ...STAFF_DATES, waiveFee: true });

      expect(quote.feeCents).toBe(0);
    });

    it('still refuses once the stay has started', async () => {
      await expect(service.staffQuote(row({ check_in: '2027-05-30', check_out: '2027-06-03' }), STAFF_DATES)).rejects.toBeInstanceOf(ConflictException);
    });

    it('quotes and changes a booking with a priced extra: the extras ride along and show in the quote', async () => {
      const breakfast: BookingExtra = { id: 'ex-1', extraServiceId: 'svc-1', name: 'Breakfast', kind: 'instant', quantity: 2, unitPriceCents: 3000, lineCents: 6000, currencyCode: 'EUR', status: 'confirmed' };
      listExtras.mockResolvedValue([breakfast]);

      const quote = await service.staffQuote(row(), STAFF_DATES);
      await service.staffChange(row(), STAFF_CHANGE, STAFF);

      // new stay 60000 + extras 6000 = 66000; fee 2000; paid 96000 -> 28000 back
      expect(quote).toMatchObject({ extrasCents: 6000, newTotalCents: 66000, refundCents: 28000 });
      expect(quote.extras).toEqual([breakfast]);
      expect(insertRefund).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ amountCents: 28000 }));
      expect(copyExtras).toHaveBeenCalledWith(expect.anything(), ID, NEW_ID);
    });

    it('refuses a change, for staff and for guests, on a booking made on another site (it moves there, not here)', async () => {
      const channel = row({ payment_method: 'paid_by_channel' });

      await expect(service.staffQuote(channel, STAFF_DATES)).rejects.toMatchObject({ status: 409, response: { code: 'BOOKED_ON_CHANNEL' } });
      await expect(service.staffChange(channel, STAFF_CHANGE, STAFF)).rejects.toMatchObject({ response: { code: 'BOOKED_ON_CHANNEL' } });
      expect(withClientCalls).toBe(0);
      expect(markCancelled).not.toHaveBeenCalled();
    });

    it('still refuses a staff change on a booking nobody has paid for', async () => {
      await expect(service.staffQuote(row({ payment_status: 'pending', paid_cents: 0 }), STAFF_DATES)).rejects.toMatchObject({ response: { code: 'PAYMENT_PENDING' } });
    });

    it('applies a cheaper change, refunds the difference and keeps who did it and why', async () => {
      const outcome = await service.staffChange(row({ policy_snapshot: snapshot({ rebookable: false }) }), STAFF_CHANGE, STAFF);

      expect(markCancelled).toHaveBeenCalledWith(expect.anything(), ID, expect.objectContaining({ reason: 'dates_changed', staffId: 'staff-1', note: 'Guest called to ask' }));
      expect(insertRefund).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ kind: 'rebook_difference', amountCents: 34000, reasonCode: 'dates_changed', initiatedBy: 'staff', createdByStaffId: 'staff-1' }),
      );
      expect(insertChange).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ initiatedBy: 'staff', staffId: 'staff-1', note: 'Guest called to ask' }));
      expect(outcome).toMatchObject({ newBookingId: NEW_ID, refund: { id: 'refund-1', status: 'succeeded' } });
      expect(recordManualPayment).not.toHaveBeenCalled();
    });

    it('writes the audit row inside the swap transaction (after the replacement exists, before the commit): who, both references, the decisions and the refund', async () => {
      await service.staffChange(row(), { ...STAFF_CHANGE, waiveFee: true }, STAFF);

      expect(recordInTransaction).toHaveBeenCalledTimes(1);
      const [, actor, action, details] = recordInTransaction.mock.calls[0] ?? [];
      expect(actor).toEqual({ organizationId: 'org', staffUserId: 'staff-1' });
      expect(action).toBe('booking.dates_changed_by_staff');
      expect(details).toMatchObject({
        targetType: 'booking',
        targetId: ID,
        metadata: { actorName: 'Sam Owner', actorRole: 'admin', waiveFee: true, balanceSettledOutside: false, refundIssued: true, refundReason: expect.any(String) },
      });
      expect(JSON.stringify(details)).not.toContain('Guest called to ask');
      expect(log.indexOf('audit')).toBeGreaterThan(log.indexOf('insertRefund'));
      expect(log.indexOf('audit')).toBeLessThan(log.indexOf('COMMIT'));
    });

    it('rolls the whole date change back when the audit row cannot be written: the old booking stays, nothing is refunded', async () => {
      recordInTransaction.mockRejectedValue(new Error('audit insert failed'));

      await expect(service.staffChange(row(), STAFF_CHANGE, STAFF)).rejects.toThrow('audit insert failed');

      expect(log).toContain('ROLLBACK');
      expect(log).not.toContain('COMMIT');
      expect(issueRefund).not.toHaveBeenCalled();
    });

    it('writes no audit row for a change a guest makes online (that is not a staff action)', async () => {
      await service.rebook({ reference: REFERENCE, email: EMAIL, newCheckIn: '2027-08-01', newCheckOut: '2027-08-03' } as never);

      expect(recordInTransaction).not.toHaveBeenCalled();
    });

    it('with the fee waived, the refund is bigger by the fee', async () => {
      await service.staffChange(row(), { ...STAFF_CHANGE, waiveFee: true }, STAFF);

      expect(insertRefund).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ amountCents: 36000 }));
    });

    it('refuses a dearer change until staff confirm the guest paid, and changes nothing', async () => {
      getQuote.mockResolvedValue(quoteFor(120000));

      await expect(service.staffChange(row(), STAFF_CHANGE, STAFF)).rejects.toMatchObject({
        response: { code: 'BALANCE_REQUIRED', message: expect.stringContaining('260.00') as string },
      });
      expect(withClientCalls).toBe(0);
      expect(markCancelled).not.toHaveBeenCalled();
    });

    it('records the outside payment as a manual payment and applies the change when staff confirm it', async () => {
      getQuote.mockResolvedValue(quoteFor(120000));

      const outcome = await service.staffChange(row(), { ...STAFF_CHANGE, balanceSettledOutside: true }, STAFF);

      expect(recordManualPayment).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ bookingId: ID, amountCents: 26000, currencyCode: 'EUR' }));
      expect(insertChange).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ paymentId: 'manual-pay', payCents: 26000 }));
      expect(outcome.refund).toBeNull();
      expect(insertRefund).not.toHaveBeenCalled();
    });

    it('refuses the same dates', async () => {
      await expect(service.staffChange(row(), { ...STAFF_CHANGE, newCheckIn: '2027-07-10', newCheckOut: '2027-07-13' }, STAFF)).rejects.toMatchObject({
        response: { code: 'NO_CHANGE' },
      });
    });

    it('refuses dates that are taken', async () => {
      getQuote.mockResolvedValue(quoteFor(60000, { available: false }));

      await expect(service.staffChange(row(), STAFF_CHANGE, STAFF)).rejects.toMatchObject({ response: { code: 'DATES_UNAVAILABLE' } });
      expect(withClientCalls).toBe(0);
    });
  });
});

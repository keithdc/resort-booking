/**
 * @file apps/api/src/modules/bookings/staff-bookings.service.spec.ts
 * @feature bookings
 * @dependencies StaffBookingsService
 */

import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { StaffRefund, StaffReservation } from '@resort-booking/shared-types';
import { isoDateInTimeZone } from '../../shared/dates/iso-date';
import type { StaffAccount } from '../../shared/roles/staff-role';
import { Test } from '@nestjs/testing';
import { SAME_DAY_NO_REFUND_LABEL, SAME_DAY_NO_REFUND_NOTICE } from './bookings.rules';
import { BookingReader } from './booking-reader';
import { BookingsRepository, type BlockKind, type BookingRow } from './bookings.repository';
import { BookingsService, type CancelInput, type CancelOutcome } from './bookings.service';
import { RebookService } from './rebook.service';
import { ReservationsService } from '../reservations/reservations.service';
import { StaffBookingsService } from './staff-bookings.service';
import { StaffRefundsRepository } from './staff-refunds.repository';

const ID = '1a2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d';
const STAFF: StaffAccount = { id: 'staff-1', organizationId: 'org', fullName: 'Sam Owner', email: 'sam@example.com', role: 'admin', organizationName: 'Org', canManageRefunds: true };
const EMPLOYEE: StaffAccount = { ...STAFF, id: 'staff-2', fullName: 'Eve Employee', role: 'employee', canManageRefunds: false };
/** An employee an admin gave "can handle refunds and money actions". */
const PERMITTED: StaffAccount = { ...EMPLOYEE, id: 'staff-3', fullName: 'Pat Permitted', canManageRefunds: true };
const LADDER = [
  { minDaysBeforeCheckIn: 7, refundPercent: 100 },
  { minDaysBeforeCheckIn: 0, refundPercent: 50 },
];

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
    booker_name: 'Ada',
    booker_email: 'ada@example.com',
    booker_phone: null,
    guest_note: null,
    payment_method: 'card',
    total_cents: 100000,
    currency_code: 'EUR',
    paid_cents: 100000,
    policy_snapshot: null,
    price_snapshot: null,
    rebook_of_id: null,
    replaced_by_id: null,
    payments: [],
    refund_id: null,
    refund_amount_cents: null,
    refund_percent: null,
    refund_status: null,
    refund_provider: null,
    refund_currency: null,
    ...overrides,
  };
}

const OUTCOME: CancelOutcome = {
  cancelledNow: true,
  refundId: 'refund-1',
  status: 'succeeded',
  plan: {} as CancelOutcome['plan'],
};

describe('StaffBookingsService', () => {
  const findById = jest.fn<Promise<BookingRow | null>, [string]>();
  const findKind = jest.fn<Promise<BlockKind | null>, [string]>();
  const cancelRow = jest.fn<Promise<CancelOutcome>, [BookingRow, CancelInput]>();
  const staffQuote = jest.fn();
  const staffChange = jest.fn();
  const policyFor = jest.fn();
  const getReservation = jest.fn<Promise<StaffReservation>, [string]>();
  const getStaffRefund = jest.fn<Promise<StaffRefund | null>, [string]>();
  let today = '2027-07-01';
  let service: StaffBookingsService;

  beforeEach(async (): Promise<void> => {
    jest.resetAllMocks();
    today = '2027-07-01';
    findById.mockResolvedValue(row());
    cancelRow.mockResolvedValue(OUTCOME);
    policyFor.mockResolvedValue({ tiers: LADDER, rebookable: false, rebookFeeType: 'none', rebookFeeValue: 0 });
    getReservation.mockResolvedValue({ id: ID } as StaffReservation);
    getStaffRefund.mockResolvedValue({ id: 'refund-1' } as StaffRefund);
    const moduleRef = await Test.createTestingModule({
      providers: [
        StaffBookingsService,
        { provide: BookingsRepository, useValue: { findById, findKind } },
        { provide: BookingsService, useValue: { cancelRow } },
        { provide: RebookService, useValue: { staffQuote, staffChange } },
        {
          provide: BookingReader,
          useValue: {
            paidCentsOf: (r: BookingRow): number => r.paid_cents ?? r.total_cents ?? 0,
            todayFor: (): string => today,
            policyFor,
          },
        },
        { provide: ReservationsService, useValue: { getReservation } },
        { provide: StaffRefundsRepository, useValue: { getStaffRefund } },
      ],
    }).compile();
    service = moduleRef.get(StaffBookingsService);
  });

  describe('cancelPreview', () => {
    it('quotes the saved policy: 9 days out refunds everything', async () => {
      const preview = await service.cancelPreview(STAFF, ID);

      expect(preview).toMatchObject({
        reference: 'BK-1A2B3C4D5E',
        canCancel: true,
        blockedReason: null,
        paidCents: 100000,
        policyRefund: { refundPercent: 100, refundCents: 100000, daysBeforeCheckIn: 9 },
      });
    });

    it('still allows cancelling after the stay started', async () => {
      today = '2027-07-11';

      const preview = await service.cancelPreview(STAFF, ID);

      expect(preview.canCancel).toBe(true);
      // After check-in no policy tier applies: staff choose goodwill or property-cancelled for money back.
      expect(preview.policyRefund).toMatchObject({ refundCents: 0, refundPercent: 0 });
    });

    it('has no policy refund when the policy has no ladder', async () => {
      policyFor.mockResolvedValue({ tiers: [], rebookable: false, rebookFeeType: 'none', rebookFeeValue: 0 });

      expect((await service.cancelPreview(STAFF, ID)).policyRefund).toBeNull();
    });

    it('explains a cancelled booking', async () => {
      findById.mockResolvedValue(row({ status: 'cancelled' }));

      expect(await service.cancelPreview(STAFF, ID)).toMatchObject({ canCancel: false, blockedReason: 'This booking is already cancelled.', notice: null, policyRefund: null });
    });

    it('explains a hold', async () => {
      findById.mockResolvedValue(null);
      findKind.mockResolvedValue({ id: ID, organization_id: 'org', kind: 'hold', status: 'active', currency_code: 'EUR' });

      const preview = await service.cancelPreview(STAFF, ID);

      expect(preview.canCancel).toBe(false);
      expect(preview.blockedReason).toContain('hold');
    });

    it('404s for an unknown id and for another organization\'s booking', async () => {
      findById.mockResolvedValue(null);
      findKind.mockResolvedValue(null);
      await expect(service.cancelPreview(STAFF, ID)).rejects.toBeInstanceOf(NotFoundException);

      findById.mockResolvedValue(row({ organization_id: 'other' }));
      await expect(service.cancelPreview(STAFF, ID)).rejects.toMatchObject({ response: { code: 'BOOKING_NOT_FOUND' } });
    });
  });

  describe('cancel', () => {
    it('guest_request refunds per the saved policy and keeps who and why', async () => {
      const result = await service.cancel(STAFF, ID, { reason: 'guest_request', refundCents: null, note: '  Guest emailed  ' });

      expect(cancelRow).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ refundCents: 100000, percent: 100, reasonCode: 'guest_request', initiatedBy: 'staff', staffId: 'staff-1', note: 'Guest emailed' }),
      );
      expect(result).toEqual({ reservation: { id: ID }, refund: { id: 'refund-1' } });
    });

    it('property_cancelled refunds 100% of what was paid, whatever the policy says', async () => {
      today = '2027-07-11';

      await service.cancel(STAFF, ID, { reason: 'property_cancelled', refundCents: null, note: 'Pipe burst' });

      expect(cancelRow).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ refundCents: 100000, percent: 100, reasonCode: 'property_cancelled' }));
    });

    it('goodwill refunds exactly the chosen amount, 0 to paid inclusive', async () => {
      await service.cancel(STAFF, ID, { reason: 'goodwill', refundCents: 25000, note: 'Kind gesture' });
      await service.cancel(STAFF, ID, { reason: 'goodwill', refundCents: 0, note: 'Kind gesture' });
      await service.cancel(STAFF, ID, { reason: 'goodwill', refundCents: 100000, note: 'Kind gesture' });

      expect(cancelRow.mock.calls.map(([, input]) => [input.refundCents, input.percent])).toEqual([[25000, 25], [0, 0], [100000, 100]]);
    });

    it.each([null, -1, 100001, 10.5])('goodwill refuses the amount %j with INVALID_REFUND_AMOUNT', async (refundCents) => {
      await expect(service.cancel(STAFF, ID, { reason: 'goodwill', refundCents, note: 'Kind gesture' })).rejects.toMatchObject({
        response: { code: 'INVALID_REFUND_AMOUNT' },
      });
      expect(cancelRow).not.toHaveBeenCalled();
    });

    it('INVALID_REFUND_AMOUNT is a 400', async () => {
      await expect(service.cancel(STAFF, ID, { reason: 'goodwill', refundCents: 999999, note: 'abc' })).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses an already cancelled booking without touching money', async () => {
      findById.mockResolvedValue(row({ status: 'cancelled' }));

      await expect(service.cancel(STAFF, ID, { reason: 'guest_request', refundCents: null, note: 'abc' })).rejects.toMatchObject({
        response: { code: 'BOOKING_CANCELLED' },
      });
      expect(cancelRow).not.toHaveBeenCalled();
    });

    it('refuses with 409 when someone cancelled it a moment earlier (race), never a second refund', async () => {
      cancelRow.mockResolvedValue({ ...OUTCOME, cancelledNow: false, refundId: null });

      await expect(service.cancel(STAFF, ID, { reason: 'guest_request', refundCents: null, note: 'abc' })).rejects.toBeInstanceOf(ConflictException);
      expect(getReservation).not.toHaveBeenCalled();
    });

    it('returns refund null when no refund was recorded', async () => {
      cancelRow.mockResolvedValue({ ...OUTCOME, refundId: null });

      expect((await service.cancel(STAFF, ID, { reason: 'goodwill', refundCents: 0, note: 'abc' })).refund).toBeNull();
    });

    it('404s for another organization and a hold says it is not a confirmed booking', async () => {
      findById.mockResolvedValue(row({ organization_id: 'other' }));
      await expect(service.cancel(STAFF, ID, { reason: 'guest_request', refundCents: null, note: 'abc' })).rejects.toBeInstanceOf(NotFoundException);

      findById.mockResolvedValue(null);
      findKind.mockResolvedValue({ id: ID, organization_id: 'org', kind: 'hold', status: 'active', currency_code: null });
      await expect(service.cancel(STAFF, ID, { reason: 'guest_request', refundCents: null, note: 'abc' })).rejects.toMatchObject({
        response: { code: 'BOOKING_NOT_CONFIRMED' },
      });
      expect(cancelRow).not.toHaveBeenCalled();
    });
  });

  describe('cancel as an employee without refund access (R2-01: money decisions need money access)', () => {
    it('may cancel under the guest policy and the refund is the policy amount', async () => {
      await service.cancel(EMPLOYEE, ID, { reason: 'guest_request', refundCents: null, note: 'Guest emailed' });

      expect(cancelRow).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ refundCents: 100000, reasonCode: 'guest_request', staffId: 'staff-2' }));
    });

    it.each([
      ['property_cancelled', null],
      ['goodwill', 25000],
      ['goodwill', 0],
      ['guest_request', 100000],
    ] as const)('refuses reason %s with amount %j before touching the booking or money', async (reason, refundCents) => {
      await expect(service.cancel(EMPLOYEE, ID, { reason, refundCents, note: 'Kind gesture' })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.cancel(EMPLOYEE, ID, { reason, refundCents, note: 'Kind gesture' })).rejects.toMatchObject({
        response: { code: 'FORBIDDEN_ROLE' },
      });
      expect(findById).not.toHaveBeenCalled();
      expect(cancelRow).not.toHaveBeenCalled();
    });

    it('an admin still may use every reason', async () => {
      await service.cancel(STAFF, ID, { reason: 'property_cancelled', refundCents: null, note: 'Pipe burst' });
      await service.cancel(STAFF, ID, { reason: 'goodwill', refundCents: 500, note: 'Kind gesture' });

      expect(cancelRow).toHaveBeenCalledTimes(2);
    });
  });

  describe('cancel as an employee WITH refund access (same rules as an admin)', () => {
    it.each([
      ['property_cancelled', null, 100000, 100],
      ['goodwill', 25000, 25000, 25],
      ['goodwill', 0, 0, 0],
    ] as const)('may use reason %s with amount %j', async (reason, refundCents, expectedCents, expectedPercent) => {
      await service.cancel(PERMITTED, ID, { reason, refundCents, note: 'Kind gesture' });

      expect(cancelRow).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ refundCents: expectedCents, percent: expectedPercent, reasonCode: reason, initiatedBy: 'staff', staffId: 'staff-3' }),
      );
    });

    it('may pick an explicit amount with guest_request too, and goodwill is still capped at what was paid', async () => {
      await expect(service.cancel(PERMITTED, ID, { reason: 'goodwill', refundCents: 100001, note: 'abc' })).rejects.toMatchObject({
        response: { code: 'INVALID_REFUND_AMOUNT' },
      });
      expect(cancelRow).not.toHaveBeenCalled();
    });

    it('may waive the change fee and declare the balance paid outside the system', async () => {
      staffQuote.mockResolvedValue({ feeCents: 0 });
      staffChange.mockResolvedValue({ newBookingId: 'new-id', refund: null });
      const dates = { newCheckIn: '2027-08-01', newCheckOut: '2027-08-04', waiveFee: true };

      await service.changeQuote(PERMITTED, ID, dates);
      await service.changeDates(PERMITTED, ID, { ...dates, note: 'abc', balanceSettledOutside: true });

      expect(staffChange).toHaveBeenCalledTimes(1);
    });

    it('loses everything again the moment the permission is gone (the account is read on every request)', async () => {
      await expect(service.cancel({ ...PERMITTED, canManageRefunds: false }, ID, { reason: 'goodwill', refundCents: 1, note: 'abc' })).rejects.toMatchObject({
        response: { code: 'FORBIDDEN_ROLE' },
      });
    });
  });

  describe('check-in today or past in property time (same-day rule)', () => {
    const DATES = { newCheckIn: '2027-08-01', newCheckOut: '2027-08-04', waiveFee: false };
    const CANCEL = { reason: 'guest_request', refundCents: null, note: 'Guest emailed' } as const;
    const CHANGE = { ...DATES, note: 'abc', balanceSettledOutside: false };

    it('lets an employee cancel when check-in is tomorrow (the ladder decides the refund)', async () => {
      today = '2027-07-09'; // check-in is 2027-07-10

      await service.cancel(EMPLOYEE, ID, CANCEL);

      expect(cancelRow).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ refundCents: 50000, percent: 50, reasonCode: 'guest_request' }));
    });

    it.each(['2027-07-10', '2027-07-11', '2027-08-30'])(
      'cancels for an employee WITHOUT refund access when today is %s (check-in 2027-07-10), with the refund forced to zero',
      async (todayIso) => {
        today = todayIso;

        const result = await service.cancel(EMPLOYEE, ID, CANCEL);

        expect(cancelRow).toHaveBeenCalledTimes(1);
        expect(cancelRow).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({
            refundCents: 0,
            percent: 0,
            reasonCode: 'guest_request',
            label: SAME_DAY_NO_REFUND_LABEL,
            initiatedBy: 'staff',
            staffId: 'staff-2',
            note: 'Guest emailed',
          }),
        );
        expect(result.refund).toEqual({ id: 'refund-1' });
      },
    );

    it('still refuses the other reasons and amounts for that employee on the check-in day (they need money access)', async () => {
      today = '2027-07-10';

      await expect(service.cancel(EMPLOYEE, ID, { reason: 'property_cancelled', refundCents: null, note: 'abc' })).rejects.toMatchObject({
        response: { code: 'FORBIDDEN_ROLE' },
      });
      await expect(service.cancel(EMPLOYEE, ID, { reason: 'guest_request', refundCents: 5000, note: 'abc' })).rejects.toMatchObject({
        response: { code: 'FORBIDDEN_ROLE' },
      });
      expect(cancelRow).not.toHaveBeenCalled();
    });

    it('change dates and its quote stay blocked on the check-in day for an employee without refund access (a money difference)', async () => {
      for (const todayIso of ['2027-07-10', '2027-07-11', '2027-08-30']) {
        today = todayIso;
        await expect(service.changeQuote(EMPLOYEE, ID, DATES)).rejects.toMatchObject({
          response: { code: 'SAME_DAY_ADMIN_ONLY', message: expect.stringContaining('An admin has to cancel or change') },
        });
        await expect(service.changeDates(EMPLOYEE, ID, CHANGE)).rejects.toMatchObject({ response: { code: 'SAME_DAY_ADMIN_ONLY' } });
        await expect(service.changeDates(EMPLOYEE, ID, CHANGE)).rejects.toBeInstanceOf(ForbiddenException);
      }
      expect(staffQuote).not.toHaveBeenCalled();
      expect(staffChange).not.toHaveBeenCalled();
    });

    it('lets an employee change dates when check-in is tomorrow', async () => {
      today = '2027-07-09';
      staffQuote.mockResolvedValue({ feeCents: 0 });
      staffChange.mockResolvedValue({ newBookingId: 'new-id', refund: null });

      await service.changeQuote(EMPLOYEE, ID, DATES);
      await service.changeDates(EMPLOYEE, ID, CHANGE);

      expect(staffChange).toHaveBeenCalledTimes(1);
    });

    it.each([
      ['an admin', STAFF],
      ['an employee with refund access', PERMITTED],
    ])('%s is never locked: the ladder result on the check-in day, custom amounts, and moving dates after the stay began', async (_label, who) => {
      today = '2027-07-10';
      await service.cancel(who, ID, CANCEL);
      expect(cancelRow).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ refundCents: 50000, percent: 50 }));
      expect(cancelRow).toHaveBeenLastCalledWith(expect.anything(), expect.not.objectContaining({ label: SAME_DAY_NO_REFUND_LABEL }));

      await service.cancel(who, ID, { reason: 'goodwill', refundCents: 7000, note: 'Kind gesture' });
      expect(cancelRow).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ refundCents: 7000, percent: 7 }));

      today = '2027-07-11';
      staffChange.mockResolvedValue({ newBookingId: 'new-id', refund: null });
      await service.changeDates(who, ID, CHANGE);
      expect(staffChange).toHaveBeenCalledTimes(1);
    });

    it('uses the property day: 21:30 UTC on 2027-07-01 is already the 2nd in Auckland', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2027-07-01T21:30:00Z'));
      try {
        const moduleRef = await Test.createTestingModule({
          providers: [
            StaffBookingsService,
            { provide: BookingsRepository, useValue: { findById, findKind } },
            { provide: BookingsService, useValue: { cancelRow } },
            { provide: RebookService, useValue: { staffQuote, staffChange } },
            {
              provide: BookingReader,
              useValue: {
                paidCentsOf: (r: BookingRow): number => r.paid_cents ?? 0,
                todayFor: (r: BookingRow): string => isoDateInTimeZone(new Date(), r.property_timezone),
                policyFor,
              },
            },
            { provide: ReservationsService, useValue: { getReservation } },
            { provide: StaffRefundsRepository, useValue: { getStaffRefund } },
          ],
        }).compile();
        const real = moduleRef.get(StaffBookingsService);
        findById.mockResolvedValue(row({ check_in: '2027-07-02', check_out: '2027-07-04', property_timezone: 'Pacific/Auckland' }));
        await real.cancel(EMPLOYEE, ID, CANCEL);
        expect(cancelRow).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ refundCents: 0, percent: 0, label: SAME_DAY_NO_REFUND_LABEL }));

        findById.mockResolvedValue(row({ check_in: '2027-07-02', check_out: '2027-07-04', property_timezone: 'Europe/Paris' }));
        await real.cancel(EMPLOYEE, ID, CANCEL);
        expect(cancelRow).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ refundCents: 50000, percent: 50 }));
      } finally {
        jest.useRealTimers();
      }
    });

    it('the preview tells an employee without access it can cancel with refund 0 and a clear note; others get the ladder', async () => {
      today = '2027-07-10';

      const employee = await service.cancelPreview(EMPLOYEE, ID);
      expect(employee).toMatchObject({
        canCancel: true,
        blockedReason: null,
        notice: SAME_DAY_NO_REFUND_NOTICE,
        policyRefund: { paidCents: 100000, refundCents: 0, refundPercent: 0, daysBeforeCheckIn: 0 },
      });
      expect(SAME_DAY_NO_REFUND_NOTICE).toBe('Check-in is today: no refund applies. An admin or someone with refund access can decide otherwise.');

      for (const who of [STAFF, PERMITTED]) {
        expect(await service.cancelPreview(who, ID)).toMatchObject({ canCancel: true, notice: null, policyRefund: { refundCents: 50000 } });
      }

      today = '2027-07-09';
      expect(await service.cancelPreview(EMPLOYEE, ID)).toMatchObject({ canCancel: true, notice: null, policyRefund: { refundCents: 50000 } });
    });

    it('the zero-refund preview does not need the policy to have a ladder', async () => {
      today = '2027-07-10';
      policyFor.mockResolvedValue({ tiers: [], rebookable: false, rebookFeeType: 'none', rebookFeeValue: 0 });

      expect(await service.cancelPreview(EMPLOYEE, ID)).toMatchObject({ canCancel: true, policyRefund: { refundCents: 0 } });
    });
  });

  describe('change dates as an employee without refund access', () => {
    const DATES = { newCheckIn: '2027-08-01', newCheckOut: '2027-08-04', waiveFee: false };

    it('may quote and move dates with the normal fee and no outside settlement', async () => {
      staffQuote.mockResolvedValue({ feeCents: 0 });
      staffChange.mockResolvedValue({ newBookingId: 'new-id', refund: null });

      await service.changeQuote(EMPLOYEE, ID, DATES);
      await service.changeDates(EMPLOYEE, ID, { ...DATES, note: 'abc', balanceSettledOutside: false });

      expect(staffChange).toHaveBeenCalledTimes(1);
    });

    it('cannot waive the fee, in the quote or in the change', async () => {
      await expect(service.changeQuote(EMPLOYEE, ID, { ...DATES, waiveFee: true })).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.changeDates(EMPLOYEE, ID, { ...DATES, waiveFee: true, note: 'abc', balanceSettledOutside: false })).rejects.toBeInstanceOf(ForbiddenException);
      expect(staffQuote).not.toHaveBeenCalled();
      expect(staffChange).not.toHaveBeenCalled();
    });

    it('cannot declare the balance paid outside the system', async () => {
      await expect(service.changeDates(EMPLOYEE, ID, { ...DATES, note: 'abc', balanceSettledOutside: true })).rejects.toMatchObject({
        response: { code: 'FORBIDDEN_ROLE' },
      });
      expect(staffChange).not.toHaveBeenCalled();
    });

    it('an admin and an employee with refund access may do both', async () => {
      staffQuote.mockResolvedValue({ feeCents: 0 });
      staffChange.mockResolvedValue({ newBookingId: 'new-id', refund: null });

      await service.changeQuote(STAFF, ID, { ...DATES, waiveFee: true });
      await service.changeDates(STAFF, ID, { ...DATES, waiveFee: true, note: 'abc', balanceSettledOutside: true });
      await service.changeDates(PERMITTED, ID, { ...DATES, waiveFee: true, note: 'abc', balanceSettledOutside: true });

      expect(staffChange).toHaveBeenCalledTimes(2);
    });
  });

  describe('change dates', () => {
    const DATES = { newCheckIn: '2027-08-01', newCheckOut: '2027-08-04', waiveFee: false };

    it('quotes through the rebook service', async () => {
      staffQuote.mockResolvedValue({ feeCents: 0 });

      expect(await service.changeQuote(STAFF, ID, DATES)).toEqual({ feeCents: 0 });
      expect(staffQuote).toHaveBeenCalledWith(expect.objectContaining({ id: ID }), DATES);
    });

    it('returns the NEW booking and the difference refund', async () => {
      staffChange.mockResolvedValue({ newBookingId: 'new-id', refund: { id: 'refund-1', status: 'succeeded' } });

      const result = await service.changeDates(STAFF, ID, { ...DATES, note: 'abc', balanceSettledOutside: false });

      expect(getReservation).toHaveBeenCalledWith('new-id');
      expect(result.refund).toEqual({ id: 'refund-1' });
    });

    it('returns no refund when there was no difference to give back', async () => {
      staffChange.mockResolvedValue({ newBookingId: 'new-id', refund: null });

      expect((await service.changeDates(STAFF, ID, { ...DATES, note: 'abc', balanceSettledOutside: true })).refund).toBeNull();
    });

    it('does not change a cancelled booking or another organization\'s booking', async () => {
      findById.mockResolvedValue(row({ status: 'cancelled' }));
      await expect(service.changeDates(STAFF, ID, { ...DATES, note: 'abc', balanceSettledOutside: false })).rejects.toMatchObject({ response: { code: 'BOOKING_CANCELLED' } });

      findById.mockResolvedValue(row({ organization_id: 'other' }));
      await expect(service.changeQuote(STAFF, ID, DATES)).rejects.toBeInstanceOf(NotFoundException);
      expect(staffChange).not.toHaveBeenCalled();
    });
  });
});

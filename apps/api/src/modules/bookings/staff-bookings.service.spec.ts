/**
 * @file apps/api/src/modules/bookings/staff-bookings.service.spec.ts
 * @feature bookings
 * @dependencies StaffBookingsService
 */

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { StaffProfile, StaffRefund, StaffReservation } from '@resort-booking/shared-types';
import { Test } from '@nestjs/testing';
import { BookingReader } from './booking-reader';
import { BookingsRepository, type BlockKind, type BookingRow } from './bookings.repository';
import { BookingsService, type CancelInput, type CancelOutcome } from './bookings.service';
import { RebookService } from './rebook.service';
import { ReservationsService } from '../reservations/reservations.service';
import { StaffBookingsService } from './staff-bookings.service';
import { StaffRefundsRepository } from './staff-refunds.repository';

const ID = '1a2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d';
const STAFF: StaffProfile = { id: 'staff-1', organizationId: 'org', fullName: 'Sam Owner', email: 'sam@example.com' };
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

      expect(await service.cancelPreview(STAFF, ID)).toMatchObject({ canCancel: false, blockedReason: 'This booking is already cancelled.', policyRefund: null });
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

/**
 * @file apps/api/src/modules/bookings/bookings.controller.spec.ts
 * @feature bookings
 */

import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { GuestBooking, HouseAvailability, RebookQuote, RebookResult } from '@resort-booking/shared-types';
import type { Request } from 'express';
import { BookingRateLimiter } from './booking-rate-limiter';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';
import { RebookService } from './rebook.service';

const BOOKING: GuestBooking = {
  reference: 'BK-1A2B3C4D5E',
  reservationId: 'id',
  stayName: 'Lake Chalet',
  propertyName: 'Alpine Lake',
  checkIn: '2027-07-10',
  checkOut: '2027-07-13',
  guestCount: 2,
  bookerName: 'Ada',
  totalCents: 96000,
  currencyCode: 'EUR',
  status: 'confirmed',
  canCancel: true,
  cancelBlockedReason: null,
  refundQuote: null,
  refund: null,
  rebookable: false,
  canChangeDates: false,
  changeDatesBlockedReason: null,
  replacedByReference: null,
};
const BODY = { reference: 'BK-1A2B3C4D5E', email: 'ada@example.com' };
const REBOOK_BODY = { ...BODY, newCheckIn: '2027-08-01', newCheckOut: '2027-08-04' };
const AVAILABILITY: HouseAvailability = { houseId: 'h', from: '2027-06-01', to: '2028-06-01', unavailable: [], maxCheckOutDate: null };
const QUOTE: RebookQuote = {
  reference: 'BK-1A2B3C4D5E',
  newCheckIn: '2027-08-01',
  newCheckOut: '2027-08-04',
  nights: 3,
  currencyCode: 'EUR',
  lines: [],
  subtotalCents: 60000,
  discounts: [],
  discountCents: 0,
  newTotalCents: 60000,
  feeCents: 2000,
  paidCents: 96000,
  balanceCents: -34000,
  payCents: 0,
  refundCents: 34000,
  available: true,
  problem: null,
  promoCode: null,
};
const RESULT: RebookResult = { outcome: 'changed', booking: BOOKING, payment: null, refund: null };
const REQUEST = { ip: '1.2.3.4' } as Request;

describe('BookingsController', () => {
  const lookup = jest.fn<Promise<GuestBooking>, [typeof BODY]>();
  const cancel = jest.fn<Promise<GuestBooking>, [typeof BODY]>();
  const availabilityFor = jest.fn<Promise<HouseAvailability>, [typeof BODY]>();
  const quote = jest.fn<Promise<RebookQuote>, [typeof REBOOK_BODY]>();
  const rebook = jest.fn<Promise<RebookResult>, [typeof REBOOK_BODY]>();
  const check = jest.fn<Promise<void>, [string | undefined, string?]>();
  let controller: BookingsController;

  beforeEach(async () => {
    jest.resetAllMocks();
    check.mockResolvedValue(undefined);
    lookup.mockResolvedValue(BOOKING);
    cancel.mockResolvedValue(BOOKING);
    availabilityFor.mockResolvedValue(AVAILABILITY);
    quote.mockResolvedValue(QUOTE);
    rebook.mockResolvedValue(RESULT);
    const moduleRef = await Test.createTestingModule({
      controllers: [BookingsController],
      providers: [
        { provide: BookingsService, useValue: { lookup, cancel } },
        { provide: RebookService, useValue: { availabilityFor, quote, rebook } },
        { provide: BookingRateLimiter, useValue: { check } },
      ],
    }).compile();
    controller = moduleRef.get(BookingsController);
  });

  it('wraps the booking in the ok envelope for a lookup, after counting the attempt for that IP', async () => {
    await expect(controller.lookup(BODY, REQUEST)).resolves.toEqual({ status: 'ok', data: BOOKING });

    expect(check).toHaveBeenCalledWith('1.2.3.4', BODY.reference);
    expect(lookup).toHaveBeenCalledWith(BODY);
  });

  it('wraps the cancelled booking in the ok envelope for a cancel, after counting the attempt', async () => {
    await expect(controller.cancel(BODY, REQUEST)).resolves.toEqual({ status: 'ok', data: BOOKING });

    expect(check).toHaveBeenCalledWith('1.2.3.4', BODY.reference);
    expect(cancel).toHaveBeenCalledWith(BODY);
  });

  it('never reaches the service when the caller is rate limited', async () => {
    check.mockRejectedValue(new HttpException({ code: 'LOOKUP_RATE_LIMITED' }, 429));

    await expect(controller.lookup(BODY, REQUEST)).rejects.toBeInstanceOf(HttpException);
    await expect(controller.cancel(BODY, REQUEST)).rejects.toBeInstanceOf(HttpException);

    expect(lookup).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });

  describe('changing dates', () => {
    it('returns the taken nights for the picker, after counting the attempt', async () => {
      await expect(controller.rebookAvailability(BODY, REQUEST)).resolves.toEqual({ status: 'ok', data: AVAILABILITY });

      expect(check).toHaveBeenCalledWith('1.2.3.4', BODY.reference);
      expect(availabilityFor).toHaveBeenCalledWith(BODY);
    });

    it('returns a quote without changing anything', async () => {
      await expect(controller.rebookQuote(REBOOK_BODY, REQUEST)).resolves.toEqual({ status: 'ok', data: QUOTE });

      expect(quote).toHaveBeenCalledWith(REBOOK_BODY);
      expect(rebook).not.toHaveBeenCalled();
    });

    it('returns the result of a change', async () => {
      await expect(controller.rebook(REBOOK_BODY, REQUEST)).resolves.toEqual({ status: 'ok', data: RESULT });

      expect(rebook).toHaveBeenCalledWith(REBOOK_BODY);
    });

    it('shares ONE rate limit with lookup and cancel, and never reaches the service when limited', async () => {
      check.mockRejectedValue(new HttpException({ code: 'LOOKUP_RATE_LIMITED' }, 429));

      await expect(controller.rebookAvailability(BODY, REQUEST)).rejects.toBeInstanceOf(HttpException);
      await expect(controller.rebookQuote(REBOOK_BODY, REQUEST)).rejects.toBeInstanceOf(HttpException);
      await expect(controller.rebook(REBOOK_BODY, REQUEST)).rejects.toBeInstanceOf(HttpException);

      expect(availabilityFor).not.toHaveBeenCalled();
      expect(quote).not.toHaveBeenCalled();
      expect(rebook).not.toHaveBeenCalled();
      expect(check).toHaveBeenCalledTimes(3);
    });
  });
});

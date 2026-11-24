/**
 * @file apps/api/src/modules/bookings/bookings.controller.spec.ts
 * @feature bookings
 */

import { HttpException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { GuestBooking } from '@resort-booking/shared-types';
import type { Request } from 'express';
import { BookingRateLimiter } from './booking-rate-limiter';
import { BookingsController } from './bookings.controller';
import { BookingsService } from './bookings.service';

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
};
const BODY = { reference: 'BK-1A2B3C4D5E', email: 'ada@example.com' };
const REQUEST = { ip: '1.2.3.4' } as Request;

describe('BookingsController', () => {
  const lookup = jest.fn<Promise<GuestBooking>, [typeof BODY]>();
  const cancel = jest.fn<Promise<GuestBooking>, [typeof BODY]>();
  const check = jest.fn<Promise<void>, [string | undefined]>();
  let controller: BookingsController;

  beforeEach(async () => {
    jest.resetAllMocks();
    check.mockResolvedValue(undefined);
    lookup.mockResolvedValue(BOOKING);
    cancel.mockResolvedValue(BOOKING);
    const moduleRef = await Test.createTestingModule({
      controllers: [BookingsController],
      providers: [
        { provide: BookingsService, useValue: { lookup, cancel } },
        { provide: BookingRateLimiter, useValue: { check } },
      ],
    }).compile();
    controller = moduleRef.get(BookingsController);
  });

  it('wraps the booking in the ok envelope for a lookup, after counting the attempt for that IP', async () => {
    await expect(controller.lookup(BODY, REQUEST)).resolves.toEqual({ status: 'ok', data: BOOKING });

    expect(check).toHaveBeenCalledWith('1.2.3.4');
    expect(lookup).toHaveBeenCalledWith(BODY);
  });

  it('wraps the cancelled booking in the ok envelope for a cancel, after counting the attempt', async () => {
    await expect(controller.cancel(BODY, REQUEST)).resolves.toEqual({ status: 'ok', data: BOOKING });

    expect(check).toHaveBeenCalledWith('1.2.3.4');
    expect(cancel).toHaveBeenCalledWith(BODY);
  });

  it('never reaches the service when the caller is rate limited', async () => {
    check.mockRejectedValue(new HttpException({ code: 'LOOKUP_RATE_LIMITED' }, 429));

    await expect(controller.lookup(BODY, REQUEST)).rejects.toBeInstanceOf(HttpException);
    await expect(controller.cancel(BODY, REQUEST)).rejects.toBeInstanceOf(HttpException);

    expect(lookup).not.toHaveBeenCalled();
    expect(cancel).not.toHaveBeenCalled();
  });
});

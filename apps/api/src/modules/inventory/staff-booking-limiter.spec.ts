/**
 * @file apps/api/src/modules/inventory/staff-booking-limiter.spec.ts
 * @feature inventory
 */

import { HttpException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { RedisService, type WindowState } from '../../shared/redis/redis.service';
import { STAFF_BOOKING_CREATE_DEFAULT, STAFF_BOOKING_QUOTE_DEFAULT, StaffBookingLimiter } from './staff-booking-limiter';

describe('StaffBookingLimiter', () => {
  const hitWindowWithTtl = jest.fn<Promise<WindowState>, [string, number]>();
  let limiter: StaffBookingLimiter;

  beforeEach(async (): Promise<void> => {
    jest.resetAllMocks();
    jest.spyOn(Logger.prototype, 'warn').mockImplementation((): void => undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [
        StaffBookingLimiter,
        { provide: RedisService, useValue: { hitWindowWithTtl } },
        { provide: ConfigService, useValue: { get: (): undefined => undefined } },
      ],
    }).compile();
    limiter = moduleRef.get(StaffBookingLimiter);
  });

  it('counts per staff member in separate buckets for creating and price checks', async () => {
    hitWindowWithTtl.mockResolvedValue({ count: 1, ttlSeconds: 60 });
    await limiter.checkCreate('staff-1');
    await limiter.checkQuote('staff-1');

    expect(hitWindowWithTtl).toHaveBeenNthCalledWith(1, 'ratelimit:staffbooking:create:staff-1', STAFF_BOOKING_CREATE_DEFAULT.windowSeconds);
    expect(hitWindowWithTtl).toHaveBeenNthCalledWith(2, 'ratelimit:staffbooking:quote:staff-1', STAFF_BOOKING_QUOTE_DEFAULT.windowSeconds);
  });

  it('answers 429 once the staff member is over the limit', async () => {
    hitWindowWithTtl.mockResolvedValue({ count: STAFF_BOOKING_CREATE_DEFAULT.limit + 1, ttlSeconds: 30 });

    await expect(limiter.checkCreate('staff-1')).rejects.toMatchObject({ status: 429, response: { code: 'STAFF_BOOKING_RATE_LIMITED' } });
  });

  it('lets the request through when Redis is down', async () => {
    hitWindowWithTtl.mockRejectedValue(new Error('redis down'));

    await expect(limiter.checkCreate('staff-1')).resolves.toBeUndefined();
    await expect(limiter.checkQuote('staff-1')).resolves.toBeUndefined();
  });

  it('keeps an HTTP error from the counter as it is', async () => {
    hitWindowWithTtl.mockRejectedValue(new HttpException('stop', 503));

    await expect(limiter.checkCreate('staff-1')).rejects.toBeInstanceOf(HttpException);
  });
});

/**
 * @file apps/api/src/modules/bookings/bookings.controller.ts
 * @feature bookings
 * @dependencies BookingsService, BookingRateLimiter
 */

import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { ApiOkBody, GuestBooking } from '@resort-booking/shared-types';
import type { Request } from 'express';
import { BookingRateLimiter } from './booking-rate-limiter';
import { BookingLookupDto } from './dto/booking-lookup.dto';
import { BookingsService } from './bookings.service';

/**
 * Guest self-service. The booking reference plus the email it was made with is the key; there are
 * no accounts. Every call is rate limited per IP.
 */
@Controller('bookings')
export class BookingsController {
  public constructor(
    private readonly bookings: BookingsService,
    private readonly limiter: BookingRateLimiter,
  ) {}

  /**
   * The guest's booking, what cancelling now would refund, or the refund already issued.
   */
  @Post('lookup')
  @HttpCode(200)
  public async lookup(@Body() body: BookingLookupDto, @Req() request: Request): Promise<ApiOkBody<GuestBooking>> {
    await this.limiter.check(request.ip);
    return { status: 'ok', data: await this.bookings.lookup(body) };
  }

  /**
   * Cancels the booking and refunds per the policy it was made under. Repeating it is harmless.
   */
  @Post('cancel')
  @HttpCode(200)
  public async cancel(@Body() body: BookingLookupDto, @Req() request: Request): Promise<ApiOkBody<GuestBooking>> {
    await this.limiter.check(request.ip);
    return { status: 'ok', data: await this.bookings.cancel(body) };
  }
}

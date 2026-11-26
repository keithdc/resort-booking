/**
 * @file apps/api/src/modules/bookings/bookings.controller.ts
 * @feature bookings
 * @dependencies BookingsService, BookingRateLimiter
 */

import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import type { ApiOkBody, GuestBooking, HouseAvailability, RebookQuote, RebookResult } from '@resort-booking/shared-types';
import type { Request } from 'express';
import { clientIp } from '../../shared/http/client-ip';
import { BookingRateLimiter } from './booking-rate-limiter';
import { BookingLookupDto } from './dto/booking-lookup.dto';
import { RebookDto } from './dto/rebook.dto';
import { BookingsService } from './bookings.service';
import { RebookService } from './rebook.service';

/**
 * Guest self-service. The booking reference plus the email it was made with is the key; there are
 * no accounts. Every call is rate limited per IP, all sharing one budget.
 */
@Controller('bookings')
export class BookingsController {
  public constructor(
    private readonly bookings: BookingsService,
    private readonly rebooks: RebookService,
    private readonly limiter: BookingRateLimiter,
  ) {}

  /**
   * The guest's booking, what cancelling now would refund, or the refund already issued.
   */
  @Post('lookup')
  @HttpCode(200)
  public async lookup(@Body() body: BookingLookupDto, @Req() request: Request): Promise<ApiOkBody<GuestBooking>> {
    await this.limiter.check(clientIp(request), body.reference);
    return { status: 'ok', data: await this.bookings.lookup(body) };
  }

  /**
   * Cancels the booking and refunds per the policy it was made under. Repeating it is harmless.
   */
  @Post('cancel')
  @HttpCode(200)
  public async cancel(@Body() body: BookingLookupDto, @Req() request: Request): Promise<ApiOkBody<GuestBooking>> {
    await this.limiter.check(clientIp(request), body.reference);
    return { status: 'ok', data: await this.bookings.cancel(body) };
  }

  /**
   * The taken nights of this booking's stay, leaving out the booking itself, for the "change dates" picker.
   */
  @Post('rebook/availability')
  @HttpCode(200)
  public async rebookAvailability(@Body() body: BookingLookupDto, @Req() request: Request): Promise<ApiOkBody<HouseAvailability>> {
    await this.limiter.check(clientIp(request), body.reference);
    return { status: 'ok', data: await this.rebooks.availabilityFor(body) };
  }

  /**
   * What changing to the new dates would cost or refund. Never changes anything.
   */
  @Post('rebook/quote')
  @HttpCode(200)
  public async rebookQuote(@Body() body: RebookDto, @Req() request: Request): Promise<ApiOkBody<RebookQuote>> {
    await this.limiter.check(clientIp(request), body.reference);
    return { status: 'ok', data: await this.rebooks.quote(body) };
  }

  /**
   * Changes the dates now, or opens the payment for the balance when the guest owes more.
   */
  @Post('rebook')
  @HttpCode(200)
  public async rebook(@Body() body: RebookDto, @Req() request: Request): Promise<ApiOkBody<RebookResult>> {
    await this.limiter.check(clientIp(request), body.reference);
    return { status: 'ok', data: await this.rebooks.rebook(body) };
  }
}

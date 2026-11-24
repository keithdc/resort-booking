/**
 * @file apps/api/src/modules/bookings/staff-bookings.controller.ts
 * @feature bookings
 * @dependencies StaffBookingsService, StaffRefundsService, StaffGuard
 */

import { Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type {
  ApiOkBody,
  RebookQuote,
  StaffCancelPreview,
  StaffCancelResult,
  StaffChangeResult,
  StaffProfile,
  StaffRefund,
} from '@resort-booking/shared-types';
import { StaffGuard, type StaffRequest } from '../identity/staff.guard';
import { ParseUuidLikePipe } from '../../shared/validation/parse-uuid-like.pipe';
import { MarkRefundPaidDto, StaffCancelDto, StaffChangeDatesDto, StaffChangeQuoteDto } from './dto/staff-actions.dto';
import { StaffRefundsQueryDto } from './dto/staff-refunds-query.dto';
import { StaffBookingsService } from './staff-bookings.service';
import { StaffRefundsService } from './staff-refunds.service';

/**
 * Staff actions on guests' bookings and refunds. Every route needs a staff token.
 */
@Controller('staff')
@UseGuards(StaffGuard)
export class StaffBookingsController {
  public constructor(
    private readonly bookings: StaffBookingsService,
    private readonly refunds: StaffRefundsService,
  ) {}

  /** What cancelling would refund under the booking's saved policy. Changes nothing. */
  @Get('reservations/:id/cancel-preview')
  public async cancelPreview(
    @Param('id', ParseUuidLikePipe) id: string,
    @Req() request: StaffRequest,
  ): Promise<ApiOkBody<StaffCancelPreview>> {
    return { status: 'ok', data: await this.bookings.cancelPreview(this.staff(request), id) };
  }

  /** Cancels a booking for the guest and refunds per the chosen reason. */
  @Post('reservations/:id/cancel')
  @HttpCode(200)
  public async cancel(
    @Param('id', ParseUuidLikePipe) id: string,
    @Body() body: StaffCancelDto,
    @Req() request: StaffRequest,
  ): Promise<ApiOkBody<StaffCancelResult>> {
    return { status: 'ok', data: await this.bookings.cancel(this.staff(request), id, body) };
  }

  /** What moving the booking to new dates would cost or refund. Changes nothing. */
  @Post('reservations/:id/change-dates/quote')
  @HttpCode(200)
  public async changeQuote(
    @Param('id', ParseUuidLikePipe) id: string,
    @Body() body: StaffChangeQuoteDto,
    @Req() request: StaffRequest,
  ): Promise<ApiOkBody<RebookQuote>> {
    return { status: 'ok', data: await this.bookings.changeQuote(this.staff(request), id, body) };
  }

  /** Moves the booking to new dates. */
  @Post('reservations/:id/change-dates')
  @HttpCode(200)
  public async changeDates(
    @Param('id', ParseUuidLikePipe) id: string,
    @Body() body: StaffChangeDatesDto,
    @Req() request: StaffRequest,
  ): Promise<ApiOkBody<StaffChangeResult>> {
    return { status: 'ok', data: await this.bookings.changeDates(this.staff(request), id, body) };
  }

  /** Refunds, newest first. By default the ones that still need a person (pending and failed). */
  @Get('refunds')
  public async listRefunds(@Query() query: StaffRefundsQueryDto, @Req() request: StaffRequest): Promise<ApiOkBody<StaffRefund[]>> {
    const data = await this.refunds.list(this.staff(request), query.status ?? 'needs_attention', query.propertyId ?? null);
    return { status: 'ok', data };
  }

  /** Asks the payment provider to send a failed refund again. */
  @Post('refunds/:id/retry')
  @HttpCode(200)
  public async retry(@Param('id', ParseUuidLikePipe) id: string, @Req() request: StaffRequest): Promise<ApiOkBody<StaffRefund>> {
    return { status: 'ok', data: await this.refunds.retry(this.staff(request), id) };
  }

  /** Staff sent the money themselves. */
  @Post('refunds/:id/mark-paid')
  @HttpCode(200)
  public async markPaid(
    @Param('id', ParseUuidLikePipe) id: string,
    @Body() body: MarkRefundPaidDto,
    @Req() request: StaffRequest,
  ): Promise<ApiOkBody<StaffRefund>> {
    return { status: 'ok', data: await this.refunds.markPaid(this.staff(request), id, body.note) };
  }

  /** The signed-in staff member the guard attached. */
  private staff(request: StaffRequest): StaffProfile {
    const staff = request.staff;
    if (staff === undefined) {
      // The guard always sets it; this only narrows the type.
      throw new Error('Staff profile missing after StaffGuard');
    }
    return staff;
  }
}

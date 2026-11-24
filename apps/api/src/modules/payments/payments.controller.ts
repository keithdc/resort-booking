/**
 * @file apps/api/src/modules/payments/payments.controller.ts
 * @feature payments
 * @dependencies PaymentsService
 */

import { Body, Controller, Param, Post } from '@nestjs/common';
import type { ApiOkBody, MockPaymentResult, PaymentSummary } from '@resort-booking/shared-types';
import { MockPaymentDto } from './dto/mock-payment.dto';
import { PaymentsService } from './payments.service';

@Controller()
export class PaymentsController {
  public constructor(private readonly payments: PaymentsService) {}

  /**
   * Starts (or returns the open) payment for a card hold.
   */
  @Post('holds/:holdId/payment')
  public async start(@Param('holdId') holdId: string): Promise<ApiOkBody<PaymentSummary>> {
    return { status: 'ok', data: await this.payments.startPayment(holdId) };
  }

  /**
   * Test mode only: settle a payment as the provider would. 404 when a real provider is active.
   */
  @Post('payments/:paymentId/mock/complete')
  public async completeMock(
    @Param('paymentId') paymentId: string,
    @Body() body: MockPaymentDto,
  ): Promise<ApiOkBody<MockPaymentResult>> {
    return { status: 'ok', data: await this.payments.completeMock(paymentId, body.outcome) };
  }
}

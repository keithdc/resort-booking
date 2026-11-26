/**
 * @file apps/api/src/modules/payments/payment-webhook.controller.ts
 * @feature payments
 * @dependencies PaymentWebhookService
 */

import { Controller, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import type { ApiOkBody } from '@resort-booking/shared-types';
import { clientIp } from '../../shared/http/client-ip';
import { PaymentWebhookService, type WebhookAck } from './payment-webhook.service';

@Controller()
export class PaymentWebhookController {
  public constructor(private readonly webhooks: PaymentWebhookService) {}

  /**
   * The payment provider's event delivery. Not a staff or guest route: it is authenticated by the provider's signature
   * over the raw body, never by a session. 404 unless this provider is the configured one and a secret is set.
   */
  @Post('payments/webhooks/:provider')
  @HttpCode(200)
  public async receive(@Param('provider') provider: string, @Req() request: RawBodyRequest<Request>): Promise<ApiOkBody<WebhookAck>> {
    const data = await this.webhooks.handle(provider, {
      rawBody: request.rawBody,
      headers: request.headers,
      ip: clientIp(request),
    });
    return { status: 'ok', data };
  }
}

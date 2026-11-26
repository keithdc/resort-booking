/**
 * @file apps/api/src/modules/payments/payments.module.ts
 * @feature payments
 * @dependencies InventoryModule, DiscountsModule, ConfigService
 */

import { Module } from '@nestjs/common';
import { DiscountsModule } from '../discounts/discounts.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ConfigService } from '@nestjs/config';
import { PaymentEventsRegistry } from './payment-events';
import { createPaymentProvider } from './payment-provider.factory';
import { PaymentWebhookController } from './payment-webhook.controller';
import { PaymentWebhookRepository } from './payment-webhook.repository';
import { PaymentWebhookService } from './payment-webhook.service';
import { createWebhookVerifier, PAYMENT_WEBHOOK_VERIFIER } from './webhook-config';
import { PaymentSettlementRegistry } from './payment-settlement';
import { PAYMENT_PROVIDER } from './payment-provider';
import { PaymentsController } from './payments.controller';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';

@Module({
  imports: [InventoryModule, DiscountsModule],
  controllers: [PaymentsController, PaymentWebhookController],
  exports: [PaymentsService, PaymentSettlementRegistry, PaymentEventsRegistry],
  providers: [
    PaymentsService,
    PaymentsRepository,
    PaymentSettlementRegistry,
    PaymentEventsRegistry,
    PaymentWebhookService,
    PaymentWebhookRepository,
    // The signature verifier: null (endpoint off) unless PAYMENT_WEBHOOK_SECRET is set. Swap in the real provider's
    // verifier here when it exists.
    {
      provide: PAYMENT_WEBHOOK_VERIFIER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        createWebhookVerifier({
          PAYMENT_WEBHOOK_SECRET: config.get<string>('PAYMENT_WEBHOOK_SECRET'),
          PAYMENT_WEBHOOK_SECRET_PREVIOUS: config.get<string>('PAYMENT_WEBHOOK_SECRET_PREVIOUS'),
          PAYMENT_WEBHOOK_TOLERANCE_SECONDS: config.get<string>('PAYMENT_WEBHOOK_TOLERANCE_SECONDS'),
        }),
    },
    // Chosen once at startup from PAYMENT_PROVIDER. Swap in Stripe here when it is configured.
    { provide: PAYMENT_PROVIDER, useFactory: () => createPaymentProvider(process.env) },
  ],
})
export class PaymentsModule {}

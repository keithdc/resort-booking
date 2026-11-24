/**
 * @file apps/api/src/modules/payments/payments.module.ts
 * @feature payments
 * @dependencies InventoryModule, DiscountsModule
 */

import { Module } from '@nestjs/common';
import { DiscountsModule } from '../discounts/discounts.module';
import { InventoryModule } from '../inventory/inventory.module';
import { createPaymentProvider } from './payment-provider.factory';
import { PAYMENT_PROVIDER } from './payment-provider';
import { PaymentsController } from './payments.controller';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';

@Module({
  imports: [InventoryModule, DiscountsModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    PaymentsRepository,
    // Chosen once at startup from PAYMENT_PROVIDER. Swap in Stripe here when it is configured.
    { provide: PAYMENT_PROVIDER, useFactory: () => createPaymentProvider(process.env) },
  ],
})
export class PaymentsModule {}

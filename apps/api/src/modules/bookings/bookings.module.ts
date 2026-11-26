/**
 * @file apps/api/src/modules/bookings/bookings.module.ts
 * @feature bookings
 * @dependencies PaymentsModule, ReservationsModule, InventoryModule, DiscountsModule
 */

import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { DiscountsModule } from '../discounts/discounts.module';
import { InventoryModule } from '../inventory/inventory.module';
import { PaymentsModule } from '../payments/payments.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { BookingReader } from './booking-reader';
import { BookingRateLimiter } from './booking-rate-limiter';
import { BookingsController } from './bookings.controller';
import { BookingsRepository } from './bookings.repository';
import { BookingsService } from './bookings.service';
import { PaymentEventsAdapter } from './payment-events.adapter';
import { RebookService } from './rebook.service';
import { RebookSettlementHandler } from './rebook-settlement.handler';
import { RefundIssuer } from './refund-issuer';
import { RefundReconcilerService } from './refund-reconciler.service';
import { RefundTimings } from './refund-timings';
import { StaffBookingsController } from './staff-bookings.controller';
import { StaffBookingsService } from './staff-bookings.service';
import { StaffRefundsRepository } from './staff-refunds.repository';
import { StaffRefundsService } from './staff-refunds.service';

@Module({
  imports: [PaymentsModule, ReservationsModule, InventoryModule, DiscountsModule, IdentityModule],
  controllers: [BookingsController, StaffBookingsController],
  providers: [
    BookingsService,
    BookingsRepository,
    BookingRateLimiter,
    BookingReader,
    RefundIssuer,
    RefundTimings,
    RefundReconcilerService,
    PaymentEventsAdapter,
    RebookService,
    RebookSettlementHandler,
    StaffBookingsService,
    StaffRefundsService,
    StaffRefundsRepository,
  ],
})
export class BookingsModule {}

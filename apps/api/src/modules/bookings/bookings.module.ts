/**
 * @file apps/api/src/modules/bookings/bookings.module.ts
 * @feature bookings
 * @dependencies PaymentsModule, ReservationsModule
 */

import { Module } from '@nestjs/common';
import { PaymentsModule } from '../payments/payments.module';
import { ReservationsModule } from '../reservations/reservations.module';
import { BookingRateLimiter } from './booking-rate-limiter';
import { BookingsController } from './bookings.controller';
import { BookingsRepository } from './bookings.repository';
import { BookingsService } from './bookings.service';

@Module({
  imports: [PaymentsModule, ReservationsModule],
  controllers: [BookingsController],
  providers: [BookingsService, BookingsRepository, BookingRateLimiter],
})
export class BookingsModule {}

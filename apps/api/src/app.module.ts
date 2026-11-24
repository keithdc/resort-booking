/**
 * @file apps/api/src/app.module.ts
 * @shared Root Nest module
 * @dependencies Config, database, redis, feature modules
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { HealthModule } from './modules/health/health.module';
import { IdentityModule } from './modules/identity/identity.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { BookingsModule } from './modules/bookings/bookings.module';
import { DiscountsModule } from './modules/discounts/discounts.module';
import { ExtrasModule } from './modules/extras/extras.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PropertyModule } from './modules/property/property.module';
import { RatesModule } from './modules/rates/rates.module';
import { ReservationsModule } from './modules/reservations/reservations.module';
import { DatabaseModule } from './shared/database/database.module';
import { RedisModule } from './shared/redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '.env.example'] }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    RedisModule,
    HealthModule,
    IdentityModule,
    PropertyModule,
    InventoryModule,
    ReservationsModule,
    ExtrasModule,
    RatesModule,
    DiscountsModule,
    PaymentsModule,
    BookingsModule,
  ],
})
export class AppModule {}

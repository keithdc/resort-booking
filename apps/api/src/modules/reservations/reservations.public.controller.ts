/**
 * @file apps/api/src/modules/reservations/reservations.public.controller.ts
 * @feature reservations
 * @dependencies ReservationsService
 */

import { Controller, Get, Param } from '@nestjs/common';
import type { ApiOkBody, CancellationPolicy } from '@resort-booking/shared-types';
import { PublicRateLimit } from '../../shared/http/public-rate-limit';
import { ReservationsService } from './reservations.service';

/**
 * Guest-readable reservation facts. Separate from the staff controller so no staff guard or
 * staff data is ever mixed into a public route.
 */
@Controller()
export class ReservationsPublicController {
  public constructor(private readonly reservations: ReservationsService) {}

  /**
   * Refund ladder and date-change rule for a published property, shown before the guest pays.
   */
  @Get('properties/:slug/cancellation-policy')
  @PublicRateLimit('read')
  public async getCancellationPolicy(@Param('slug') slug: string): Promise<ApiOkBody<CancellationPolicy>> {
    return { status: 'ok', data: await this.reservations.getPublicPolicy(slug) };
  }
}

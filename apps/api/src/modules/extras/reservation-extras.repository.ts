/**
 * @file apps/api/src/modules/extras/reservation-extras.repository.ts
 * @feature extras
 * @dependencies pg
 *
 * Saves the extras chosen on a booking (table `reservation_extras`, migration 041). Runs inside the caller's
 * transaction, so a booking and its extras are saved together or not at all.
 */

import { Injectable } from '@nestjs/common';
import type { StaffQuoteExtraLine } from '@resort-booking/shared-types';
import type { PoolClient } from 'pg';

export interface InsertBookingExtrasInput {
  organizationId: string;
  propertyId: string;
  bookingId: string;
  lines: readonly StaffQuoteExtraLine[];
}

@Injectable()
export class ReservationExtrasRepository {
  /**
   * One row per line, with a copy of the name, kind and price offered. An instant extra is confirmed; an on-request
   * one is pending and charges nothing. Does nothing for an empty list.
   */
  public async insertAll(client: PoolClient, input: InsertBookingExtrasInput): Promise<void> {
    for (const line of input.lines) {
      await client.query(
        `
        INSERT INTO reservation_extras (
          organization_id, property_id, inventory_block_id, extra_service_id,
          name, kind, quantity, unit_price_cents, line_cents, currency_code, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `,
        [
          input.organizationId,
          input.propertyId,
          input.bookingId,
          line.extraId,
          line.name,
          line.kind,
          line.quantity,
          line.unitPriceCents,
          line.lineCents,
          line.currencyCode,
          line.kind === 'instant' ? 'confirmed' : 'pending',
        ],
      );
    }
  }
}

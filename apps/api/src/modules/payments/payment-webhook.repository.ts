/**
 * @file apps/api/src/modules/payments/payment-webhook.repository.ts
 * @feature payments
 * @dependencies DatabaseService
 */

import { Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { DatabaseService } from '../../shared/database/database.service';

export type WebhookEventStatus = 'received' | 'processed' | 'ignored' | 'failed';

export interface WebhookEventInput {
  provider: string;
  eventId: string;
  type: string;
  payloadSha256: string;
}

/** How taking an event went: new, taken again after a failure or a dead process, or already done. */
export type EventRegistration = { outcome: 'new' | 'retry'; id: string } | { outcome: 'duplicate'; id: string; status: WebhookEventStatus; sameBody: boolean };

/** An event still `received` after this long belongs to a process that died, and may be taken again. */
const STALE_RECEIVED_SECONDS = 120;

@Injectable()
export class PaymentWebhookRepository {
  public constructor(private readonly database: DatabaseService) {}

  /**
   * Writes the event row BEFORE anything is applied, so one event id is processed once. A duplicate delivery is
   * acknowledged without reprocessing, except when the earlier attempt failed or died: that one is taken again
   * (attempt counted).
   */
  public async register(input: WebhookEventInput): Promise<EventRegistration> {
    const inserted = await this.database.query<{ id: string }>(
      `
      INSERT INTO payment_webhook_events (provider, provider_event_id, type, payload_sha256)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (provider, provider_event_id) DO NOTHING
      RETURNING id
      `,
      [input.provider, input.eventId, input.type, input.payloadSha256],
    );
    const fresh = inserted.rows[0];
    if (fresh !== undefined) {
      return { outcome: 'new', id: fresh.id };
    }
    const retried = await this.database.query<{ id: string }>(
      `
      UPDATE payment_webhook_events
      SET status = 'received', attempts = attempts + 1, error = NULL, updated_at = now()
      WHERE provider = $1 AND provider_event_id = $2
        AND (status = 'failed' OR (status = 'received' AND updated_at < now() - make_interval(secs => $3::int)))
      RETURNING id
      `,
      [input.provider, input.eventId, STALE_RECEIVED_SECONDS],
    );
    const taken = retried.rows[0];
    if (taken !== undefined) {
      return { outcome: 'retry', id: taken.id };
    }
    const existing = await this.database.query<{ id: string; status: WebhookEventStatus; payload_sha256: string }>(
      'SELECT id, status, payload_sha256 FROM payment_webhook_events WHERE provider = $1 AND provider_event_id = $2',
      [input.provider, input.eventId],
    );
    const row = existing.rows[0];
    if (row === undefined) {
      throw new Error('The webhook event row vanished between the insert and the read');
    }
    return { outcome: 'duplicate', id: row.id, status: row.status, sameBody: row.payload_sha256 === input.payloadSha256 };
  }

  /**
   * Finishes the event in the SAME transaction as the change it caused.
   */
  public async finish(client: PoolClient, eventRowId: string, status: 'processed' | 'ignored', note: string | null): Promise<void> {
    await client.query(
      `UPDATE payment_webhook_events SET status = $2, error = $3, processed_at = now(), updated_at = now() WHERE id = $1`,
      [eventRowId, status, note === null ? null : note.slice(0, 200)],
    );
  }

  /**
   * The processing failed (its transaction rolled back): the next delivery takes it again. Only a short code is kept.
   */
  public async markFailed(eventRowId: string, code: string): Promise<void> {
    await this.database.query(
      `UPDATE payment_webhook_events SET status = 'failed', error = $2, updated_at = now() WHERE id = $1 AND status = 'received'`,
      [eventRowId, code.slice(0, 200)],
    );
  }
}

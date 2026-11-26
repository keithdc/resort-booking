/**
 * @file apps/api/src/modules/bookings/staff-notes.repository.ts
 * @feature bookings
 * @dependencies DatabaseService
 * Staff notes on a booking (migration 043). Every statement names the organization, so another workspace's booking or
 * note answers "not found". Hidden notes are never returned.
 */

import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../shared/database/database.service';

export interface NoteRow {
  id: string;
  inventory_block_id: string;
  body: string;
  created_by_staff_id: string | null;
  author_name: string | null;
  created_at: Date;
}

const NOTE_COLUMNS = `n.id, n.inventory_block_id, n.body, n.created_by_staff_id, su.full_name AS author_name, n.created_at`;

/** Newest first, capped: a booking is not a chat log. */
export const NOTES_PER_BOOKING_CAP = 200;

@Injectable()
export class StaffNotesRepository {
  public constructor(private readonly database: DatabaseService) {}

  /** The property of a booking in this organization, or null. Notes belong to bookings, not to checkouts in progress. */
  public async findBookingProperty(organizationId: string, bookingId: string): Promise<string | null> {
    const result = await this.database.query<{ property_id: string }>(
      `SELECT property_id FROM inventory_blocks WHERE id = $1 AND organization_id = $2 AND kind = 'reservation'`,
      [bookingId, organizationId],
    );
    return result.rows[0]?.property_id ?? null;
  }

  /** The visible notes of a booking, newest first. */
  public async list(organizationId: string, bookingId: string): Promise<NoteRow[]> {
    const result = await this.database.query<NoteRow>(
      `SELECT ${NOTE_COLUMNS}
       FROM booking_staff_notes n
       LEFT JOIN staff_users su ON su.id = n.created_by_staff_id
       WHERE n.inventory_block_id = $1 AND n.organization_id = $2 AND n.deleted_at IS NULL
       ORDER BY n.created_at DESC, n.id DESC
       LIMIT ${String(NOTES_PER_BOOKING_CAP)}`,
      [bookingId, organizationId],
    );
    return result.rows;
  }

  /** How many visible notes a booking has (to stop a runaway list). */
  public async count(organizationId: string, bookingId: string): Promise<number> {
    const result = await this.database.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM booking_staff_notes WHERE inventory_block_id = $1 AND organization_id = $2 AND deleted_at IS NULL`,
      [bookingId, organizationId],
    );
    return result.rows[0]?.n ?? 0;
  }

  /** Saves a note and returns it with the author's name. */
  public async insert(input: { organizationId: string; propertyId: string; bookingId: string; body: string; staffId: string }): Promise<NoteRow> {
    const result = await this.database.query<NoteRow>(
      `WITH n AS (
         INSERT INTO booking_staff_notes (organization_id, property_id, inventory_block_id, body, created_by_staff_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *
       )
       SELECT ${NOTE_COLUMNS} FROM n LEFT JOIN staff_users su ON su.id = n.created_by_staff_id`,
      [input.organizationId, input.propertyId, input.bookingId, input.body, input.staffId],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error('Note insert returned no row');
    }
    return row;
  }

  /** One visible note of this booking, or null. */
  public async find(organizationId: string, bookingId: string, noteId: string): Promise<NoteRow | null> {
    const result = await this.database.query<NoteRow>(
      `SELECT ${NOTE_COLUMNS}
       FROM booking_staff_notes n
       LEFT JOIN staff_users su ON su.id = n.created_by_staff_id
       WHERE n.id = $1 AND n.inventory_block_id = $2 AND n.organization_id = $3 AND n.deleted_at IS NULL`,
      [noteId, bookingId, organizationId],
    );
    return result.rows[0] ?? null;
  }

  /** Hides a note, once. False when it was already hidden or is not this organization's. */
  public async hide(organizationId: string, bookingId: string, noteId: string, staffId: string): Promise<boolean> {
    const result = await this.database.query(
      `UPDATE booking_staff_notes SET deleted_at = now(), deleted_by_staff_id = $4
       WHERE id = $1 AND inventory_block_id = $2 AND organization_id = $3 AND deleted_at IS NULL`,
      [noteId, bookingId, organizationId, staffId],
    );
    return (result.rowCount ?? 0) > 0;
  }
}

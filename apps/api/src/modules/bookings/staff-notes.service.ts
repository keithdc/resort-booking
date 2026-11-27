/**
 * @file apps/api/src/modules/bookings/staff-notes.service.ts
 * @feature bookings
 * @dependencies StaffNotesRepository, StaffNoteLimiter
 * Internal staff notes on a booking. Admins and employees may read and add notes. Hiding: an admin any note, an employee
 * only their own. Notes are never edited and never reach a guest.
 */

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { StaffBookingNote } from '@resort-booking/shared-types';
import type { PoolClient } from 'pg';
import { AuditService } from '../../shared/audit/audit.service';
import type { StaffAccount } from '../../shared/roles/staff-role';
import { noteAddedAuditMetadata, noteRemovedAuditMetadata } from './staff-audit-details';
import { StaffNoteLimiter } from './staff-note-limiter';
import { NOTES_PER_BOOKING_CAP, StaffNotesRepository, type NoteRow } from './staff-notes.repository';

@Injectable()
export class StaffNotesService {
  public constructor(
    private readonly notes: StaffNotesRepository,
    private readonly limiter: StaffNoteLimiter,
    private readonly audit: AuditService,
  ) {}

  /** The visible notes of a booking, newest first. 404 for a booking that is not this workspace's. */
  public async list(staff: StaffAccount, bookingId: string): Promise<StaffBookingNote[]> {
    await this.requireBooking(staff, bookingId);
    const rows = await this.notes.list(staff.organizationId, bookingId);
    return rows.map((row: NoteRow): StaffBookingNote => toNote(row, staff));
  }

  /** Adds a note (the DTO already trimmed and bounded the text). */
  public async add(staff: StaffAccount, bookingId: string, body: string): Promise<StaffBookingNote> {
    await this.limiter.check(staff.id);
    const propertyId = await this.requireBooking(staff, bookingId);
    if ((await this.notes.count(staff.organizationId, bookingId)) >= NOTES_PER_BOOKING_CAP) {
      throw new ConflictException({
        message: 'This booking already has the most notes it can hold. Hide an old one first.',
        code: 'NOTES_LIMIT_REACHED',
      });
    }
    // The audit row (who, which booking, how long; never the text) is saved in the same transaction as the note.
    const row = await this.notes.insert({ organizationId: staff.organizationId, propertyId, bookingId, body, staffId: staff.id }, (client) =>
      this.audit.recordInTransaction(client, { organizationId: staff.organizationId, staffUserId: staff.id }, 'booking.note_added', {
        targetType: 'booking',
        targetId: bookingId,
        metadata: noteAddedAuditMetadata(staff, bookingId, body.length),
      }),
    );
    return toNote(row, staff);
  }

  /** Hides a note. An employee may only hide their own: someone else's looks the same as a missing one (404). */
  public async remove(staff: StaffAccount, bookingId: string, noteId: string): Promise<void> {
    await this.limiter.check(staff.id);
    await this.requireBooking(staff, bookingId);
    const note = await this.notes.find(staff.organizationId, bookingId, noteId);
    if (note === null || !mayHide(staff, note)) {
      throw notFound();
    }
    const audit = (client: PoolClient): Promise<void> =>
      this.audit.recordInTransaction(client, { organizationId: staff.organizationId, staffUserId: staff.id }, 'booking.note_removed', {
        targetType: 'booking',
        targetId: bookingId,
        metadata: noteRemovedAuditMetadata(staff, bookingId, noteId),
      });
    if (!(await this.notes.hide(staff.organizationId, bookingId, noteId, staff.id, audit))) {
      throw notFound();
    }
  }

  /** The booking's property id, or 404. */
  private async requireBooking(staff: StaffAccount, bookingId: string): Promise<string> {
    const propertyId = await this.notes.findBookingProperty(staff.organizationId, bookingId);
    if (propertyId === null) {
      throw new NotFoundException({ message: 'Booking not found', code: 'BOOKING_NOT_FOUND' });
    }
    return propertyId;
  }
}

function notFound(): NotFoundException {
  return new NotFoundException({ message: 'Note not found', code: 'NOTE_NOT_FOUND' });
}

/** An admin may hide any note of the workspace; anyone else only their own. */
function mayHide(staff: StaffAccount, note: NoteRow): boolean {
  return staff.role === 'admin' || note.created_by_staff_id === staff.id;
}

function toNote(row: NoteRow, staff: StaffAccount): StaffBookingNote {
  return {
    id: row.id,
    bookingId: row.inventory_block_id,
    body: row.body,
    authorName: row.author_name,
    createdAt: row.created_at.toISOString(),
    canDelete: mayHide(staff, row),
  };
}

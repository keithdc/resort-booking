/**
 * @file apps/api/src/modules/bookings/staff-notes.service.spec.ts
 * @feature bookings
 * Staff notes: who may read, add and hide, the cap, tenant answers (404), and that the rate limiter is used.
 */

import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { PoolClient } from 'pg';
import { AuditService } from '../../shared/audit/audit.service';
import type { StaffAccount } from '../../shared/roles/staff-role';
import { StaffNoteLimiter } from './staff-note-limiter';
import { NOTES_PER_BOOKING_CAP, StaffNotesRepository, type NoteRow } from './staff-notes.repository';
import { StaffNotesService } from './staff-notes.service';

const ADMIN: StaffAccount = { id: 'admin-1', organizationId: 'org-1', fullName: 'Ada Admin', email: 'a@example.com', role: 'admin', organizationName: 'Org', canManageRefunds: true };
const EMPLOYEE: StaffAccount = { ...ADMIN, id: 'emp-1', fullName: 'Eve Employee', email: 'e@example.com', role: 'employee', canManageRefunds: false };
const OTHER_EMPLOYEE: StaffAccount = { ...EMPLOYEE, id: 'emp-2', fullName: 'Oz Other' };

function row(overrides: Partial<NoteRow> = {}): NoteRow {
  return { id: 'n1', inventory_block_id: 'b1', body: 'Deposit 50 EUR paid', created_by_staff_id: 'emp-1', author_name: 'Eve Employee', created_at: new Date('2026-12-01T10:00:00Z'), ...overrides };
}

describe('StaffNotesService', () => {
  const repo = {
    findBookingProperty: jest.fn<Promise<string | null>, [string, string]>(),
    list: jest.fn<Promise<NoteRow[]>, [string, string]>(),
    count: jest.fn<Promise<number>, [string, string]>(),
    insert: jest.fn<Promise<NoteRow>, [Parameters<StaffNotesRepository['insert']>[0], ((client: PoolClient) => Promise<void>)?]>(),
    find: jest.fn<Promise<NoteRow | null>, [string, string, string]>(),
    hide: jest.fn<Promise<boolean>, [string, string, string, string, ((client: PoolClient) => Promise<void>)?]>(),
  };
  const recordInTransaction = jest.fn<Promise<void>, [PoolClient, { organizationId: string; staffUserId: string }, string, Record<string, unknown>?]>();
  const limiter = { check: jest.fn<Promise<void>, [string]>() };
  let service: StaffNotesService;

  beforeEach(async (): Promise<void> => {
    jest.resetAllMocks();
    repo.findBookingProperty.mockResolvedValue('prop-1');
    repo.count.mockResolvedValue(0);
    limiter.check.mockResolvedValue(undefined);
    recordInTransaction.mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [
        StaffNotesService,
        { provide: StaffNotesRepository, useValue: repo },
        { provide: StaffNoteLimiter, useValue: limiter },
        { provide: AuditService, useValue: { recordInTransaction } },
      ],
    }).compile();
    service = moduleRef.get(StaffNotesService);
  });

  describe('list', () => {
    it('returns the notes newest first with author and a per-viewer canDelete', async () => {
      repo.list.mockResolvedValue([row({ id: 'n2', created_by_staff_id: 'emp-2', author_name: 'Oz Other' }), row()]);

      const asEmployee = await service.list(EMPLOYEE, 'b1');
      const asAdmin = await service.list(ADMIN, 'b1');

      expect(asEmployee.map((note) => [note.id, note.authorName, note.canDelete])).toEqual([['n2', 'Oz Other', false], ['n1', 'Eve Employee', true]]);
      expect(asAdmin.every((note) => note.canDelete)).toBe(true);
      expect(asEmployee[0]).toMatchObject({ bookingId: 'b1', createdAt: '2026-12-01T10:00:00.000Z' });
      expect(repo.list).toHaveBeenCalledWith('org-1', 'b1');
    });

    it('answers 404 for a booking that is not this workspace\'s, without reading notes', async () => {
      repo.findBookingProperty.mockResolvedValue(null);

      await expect(service.list(EMPLOYEE, 'other')).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.findBookingProperty).toHaveBeenCalledWith('org-1', 'other');
      expect(repo.list).not.toHaveBeenCalled();
    });
  });

  describe('add', () => {
    it('hands the repository an audit writer for the SAME transaction: who, the booking and the length, never the text', async () => {
      const client = Object.create(null) as PoolClient;
      repo.insert.mockImplementation(async (_input, audit) => {
        await audit?.(client);
        return row();
      });

      await service.add(EMPLOYEE, 'b1', 'Deposit 50 EUR paid, card 4242');

      expect(recordInTransaction).toHaveBeenCalledTimes(1);
      const [usedClient, actor, action, details] = recordInTransaction.mock.calls[0] ?? [];
      expect(usedClient).toBe(client);
      expect(actor).toEqual({ organizationId: 'org-1', staffUserId: 'emp-1' });
      expect(action).toBe('booking.note_added');
      expect(details).toMatchObject({ targetType: 'booking', targetId: 'b1', metadata: { actorRole: 'employee', bookingId: 'b1', noteLength: 'Deposit 50 EUR paid, card 4242'.length } });
      expect(JSON.stringify(details)).not.toMatch(/Deposit|4242/);
    });

    it('does not save the note when its audit row cannot be written', async () => {
      recordInTransaction.mockRejectedValue(new Error('audit insert failed'));
      repo.insert.mockImplementation(async (_input, audit) => {
        await audit?.(Object.create(null) as PoolClient);
        return row();
      });

      await expect(service.add(EMPLOYEE, 'b1', 'x')).rejects.toThrow('audit insert failed');
    });

    it('saves the note under the signed-in person and the booking\'s own property', async () => {
      repo.insert.mockResolvedValue(row());

      const note = await service.add(EMPLOYEE, 'b1', 'Deposit 50 EUR paid');

      expect(repo.insert).toHaveBeenCalledWith({ organizationId: 'org-1', propertyId: 'prop-1', bookingId: 'b1', body: 'Deposit 50 EUR paid', staffId: 'emp-1' }, expect.any(Function));
      expect(note).toMatchObject({ id: 'n1', canDelete: true });
      expect(limiter.check).toHaveBeenCalledWith('emp-1');
    });

    it('does not touch the database when the rate limit refuses', async () => {
      limiter.check.mockRejectedValue(new Error('429'));

      await expect(service.add(EMPLOYEE, 'b1', 'x')).rejects.toThrow('429');
      expect(repo.findBookingProperty).not.toHaveBeenCalled();
      expect(repo.insert).not.toHaveBeenCalled();
    });

    it('answers 404 for a booking from another workspace', async () => {
      repo.findBookingProperty.mockResolvedValue(null);

      await expect(service.add(EMPLOYEE, 'other', 'x')).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.insert).not.toHaveBeenCalled();
    });

    it('refuses a booking that already holds the most notes', async () => {
      repo.count.mockResolvedValue(NOTES_PER_BOOKING_CAP);

      await expect(service.add(ADMIN, 'b1', 'x')).rejects.toMatchObject({ response: { code: 'NOTES_LIMIT_REACHED' } });
      await expect(service.add(ADMIN, 'b1', 'x')).rejects.toBeInstanceOf(ConflictException);
      expect(repo.insert).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('lets an employee hide their own note', async () => {
      repo.find.mockResolvedValue(row());
      repo.hide.mockResolvedValue(true);

      await service.remove(EMPLOYEE, 'b1', 'n1');

      expect(repo.hide).toHaveBeenCalledWith('org-1', 'b1', 'n1', 'emp-1', expect.any(Function));
    });

    it('hands the repository an audit writer for the SAME transaction: who, the booking and the note id, never the text', async () => {
      repo.find.mockResolvedValue(row());
      const client = Object.create(null) as PoolClient;
      repo.hide.mockImplementation(async (_org, _booking, _note, _staff, audit) => {
        await audit?.(client);
        return true;
      });

      await service.remove(EMPLOYEE, 'b1', 'n1');

      expect(recordInTransaction).toHaveBeenCalledTimes(1);
      const [usedClient, actor, action, details] = recordInTransaction.mock.calls[0] ?? [];
      expect(usedClient).toBe(client);
      expect(actor).toEqual({ organizationId: 'org-1', staffUserId: 'emp-1' });
      expect(action).toBe('booking.note_removed');
      expect(details).toMatchObject({ targetType: 'booking', targetId: 'b1', metadata: { bookingId: 'b1', noteId: 'n1' } });
      expect(JSON.stringify(details)).not.toContain('Deposit');
    });

    it('answers 404 (not 403) when an employee tries to hide a colleague\'s note, and hides nothing', async () => {
      repo.find.mockResolvedValue(row());

      await expect(service.remove(OTHER_EMPLOYEE, 'b1', 'n1')).rejects.toMatchObject({ response: { code: 'NOTE_NOT_FOUND' } });
      expect(repo.hide).not.toHaveBeenCalled();
    });

    it('lets an admin hide any note of the workspace', async () => {
      repo.find.mockResolvedValue(row());
      repo.hide.mockResolvedValue(true);

      await service.remove(ADMIN, 'b1', 'n1');

      expect(repo.hide).toHaveBeenCalledWith('org-1', 'b1', 'n1', 'admin-1', expect.any(Function));
    });

    it('answers 404 for a missing or already hidden note, and when two people hide it at once', async () => {
      repo.find.mockResolvedValueOnce(null);
      await expect(service.remove(ADMIN, 'b1', 'gone')).rejects.toBeInstanceOf(NotFoundException);

      repo.find.mockResolvedValueOnce(row());
      repo.hide.mockResolvedValueOnce(false);
      await expect(service.remove(ADMIN, 'b1', 'n1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('answers 404 for a booking from another workspace before looking at notes', async () => {
      repo.findBookingProperty.mockResolvedValue(null);

      await expect(service.remove(ADMIN, 'other', 'n1')).rejects.toMatchObject({ response: { code: 'BOOKING_NOT_FOUND' } });
      expect(repo.find).not.toHaveBeenCalled();
    });
  });
});

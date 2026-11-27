/**
 * @file apps/api/src/shared/audit/audit-in-transaction.integration.spec.ts
 * @shared Opt-in: proves against a real Postgres that an action and its audit row are saved TOGETHER or not at all (docs/13 R6-05)
 *
 * Skipped unless DATABASE_ADMIN_URL is set (a superuser URL). The database is created, migrated, given the three roles
 * and dropped afterwards. The repositories run as the least-privilege app role, exactly like the API.
 *   DATABASE_ADMIN_URL=postgres://resort:resort@localhost:5433/postgres npx jest audit-in-transaction.integration
 */

import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { Client, Pool } from 'pg';
import { BookingsRepository } from '../../modules/bookings/bookings.repository';
import { StaffNotesRepository } from '../../modules/bookings/staff-notes.repository';
import { TeamRepository } from '../../modules/team/team.repository';
import { urlWithCredentials } from '../database/database-urls';
import { DatabaseService } from '../database/database.service';
import { applyPendingMigrations, poolExecutor } from '../database/migration-files';
import { buildRoleStatements, roleOptionsFromEnv, type RoleSetupOptions } from '../database/roles';
import { AuditRepository } from './audit.repository';
import { AuditService } from './audit.service';

const adminUrl = process.env.DATABASE_ADMIN_URL?.trim() ?? '';
const suite = adminUrl === '' ? describe.skip : describe;

const SUFFIX = randomBytes(4).toString('hex');
const DATABASE = `resort_check_${SUFFIX}`;
const NAMES = { DB_OWNER_ROLE: `ait_owner_${SUFFIX}`, DB_APP_ROLE: `ait_app_${SUFFIX}`, DB_READONLY_ROLE: `ait_ro_${SUFFIX}` };
const PASSWORDS = { DB_OWNER_PASSWORD: `owner-${SUFFIX}-password`, DB_APP_PASSWORD: `app-${SUFFIX}-password`, DB_READONLY_PASSWORD: `readonly-${SUFFIX}-password` };

const ORG = '11111111-1111-1111-1111-111111111111';
const PROPERTY = '22222222-2222-2222-2222-222222222221';
const HOUSE = '33333333-3333-3333-3333-333333333331';
const MISSING_ORG = '99999999-9999-9999-9999-999999999999';

const userOf = (url: string): string => decodeURIComponent(new URL(url).username);
const passwordOf = (url: string): string => decodeURIComponent(new URL(url).password);

suite('audit rows are saved in the same transaction as the action (real Postgres, throwaway database)', () => {
  jest.setTimeout(240_000);
  let admin: Pool;
  let database: DatabaseService;
  let audit: AuditService;
  let bookings: BookingsRepository;
  let notes: StaffNotesRepository;
  let team: TeamRepository;
  let staffId = '';
  let night = 0;

  async function pendingBooking(): Promise<string> {
    night += 3;
    const start = new Date(Date.UTC(2098, 0, 1) + night * 86_400_000).toISOString().slice(0, 10);
    const end = new Date(Date.UTC(2098, 0, 1) + (night + 2) * 86_400_000).toISOString().slice(0, 10);
    const result = await admin.query<{ id: string }>(
      `INSERT INTO inventory_blocks (organization_id, property_id, house_id, kind, status, check_in, check_out, guest_count, payment_method, payment_status,
         booker_name, booker_email, total_cents, paid_cents, currency_code)
       VALUES ($1, $2, $3, 'reservation', 'confirmed', $4::date, $5::date, 2, 'pay_at_hotel', 'pending', 'Ada Guest', 'ada@example.com', 96000, 0, 'EUR') RETURNING id`,
      [ORG, PROPERTY, HOUSE, start, end],
    );
    return result.rows[0]?.id ?? '';
  }

  const auditRows = async (action: string): Promise<number> =>
    Number((await admin.query<{ n: string }>('SELECT count(*)::text AS n FROM audit_log WHERE action = $1', [action])).rows[0]?.n ?? '0');

  beforeAll(async () => {
    const maintenance = new Client({ connectionString: urlWithCredentials(adminUrl, userOf(adminUrl), passwordOf(adminUrl), 'postgres') });
    await maintenance.connect();
    await maintenance.query(`CREATE DATABASE ${DATABASE}`);
    await maintenance.end();
    admin = new Pool({ connectionString: urlWithCredentials(adminUrl, userOf(adminUrl), passwordOf(adminUrl), DATABASE), max: 2 });
    const options: RoleSetupOptions = roleOptionsFromEnv({ ...PASSWORDS, ...NAMES }, DATABASE);
    await applyPendingMigrations(poolExecutor(admin), { appRole: options.appRole });
    for (const statement of buildRoleStatements(options)) {
      await admin.query(statement.sql);
    }
    const appUrl = urlWithCredentials(adminUrl, options.appRole, options.appPassword, DATABASE);
    database = new DatabaseService(new ConfigService({ DATABASE_URL: appUrl, NODE_ENV: 'test' }));
    audit = new AuditService(new AuditRepository(database), new ConfigService({ IP_HASH_SALT: 'integration-salt' }));
    bookings = new BookingsRepository(database);
    notes = new StaffNotesRepository(database);
    team = new TeamRepository(database);
    const staff = await admin.query<{ id: string }>(
      `INSERT INTO staff_users (organization_id, full_name, email, password_hash, role) VALUES ($1, 'Ada Admin', 'ada.admin@example.com', 'x:y', 'admin') RETURNING id`,
      [ORG],
    );
    staffId = staff.rows[0]?.id ?? '';
    await admin.query(
      `INSERT INTO staff_users (organization_id, full_name, email, password_hash, role) VALUES ($1, 'Eve Employee', 'eve.employee@example.com', 'x:y', 'employee')`,
      [ORG],
    );
  });

  afterAll(async () => {
    await database.onModuleDestroy();
    await admin.end();
    const maintenance = new Client({ connectionString: urlWithCredentials(adminUrl, userOf(adminUrl), passwordOf(adminUrl), 'postgres') });
    await maintenance.connect();
    await maintenance.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    for (const role of Object.values(NAMES)) {
      await maintenance.query(`DROP ROLE IF EXISTS ${role}`);
    }
    await maintenance.end();
  });

  describe('mark paid', () => {
    it('saves the payment and its audit row together', async () => {
      const id = await pendingBooking();
      const before = await auditRows('booking.marked_paid');

      const marked = await bookings.markPaid(id, staffId, ORG, (client) =>
        audit.recordInTransaction(client, { organizationId: ORG, staffUserId: staffId, ip: '203.0.113.9', requestId: 'req-int-1' }, 'booking.marked_paid', { targetType: 'booking', targetId: id, metadata: { paidCents: 96000 } }),
      );

      expect(marked).toBe(true);
      expect((await admin.query<{ payment_status: string }>('SELECT payment_status FROM inventory_blocks WHERE id = $1', [id])).rows[0]?.payment_status).toBe('paid');
      expect(await auditRows('booking.marked_paid')).toBe(before + 1);
      const row = (await admin.query<{ ip_hash: string | null; request_id: string | null }>("SELECT ip_hash, request_id FROM audit_log WHERE action = 'booking.marked_paid' ORDER BY created_at DESC LIMIT 1")).rows[0];
      expect(row?.request_id).toBe('req-int-1');
      expect(row?.ip_hash).not.toBeNull();
      expect(row?.ip_hash).not.toContain('203.0.113.9');
    });

    it('does NOT mark it paid when the audit row cannot be written: still pending, no row', async () => {
      const id = await pendingBooking();
      const before = await auditRows('booking.marked_paid');

      // An organization that does not exist breaks the audit row's foreign key, a real database failure.
      await expect(
        bookings.markPaid(id, staffId, ORG, (client) => audit.recordInTransaction(client, { organizationId: MISSING_ORG, staffUserId: staffId }, 'booking.marked_paid')),
      ).rejects.toThrow();

      expect((await admin.query<{ payment_status: string }>('SELECT payment_status FROM inventory_blocks WHERE id = $1', [id])).rows[0]?.payment_status).toBe('pending');
      expect(await auditRows('booking.marked_paid')).toBe(before);
    });

    it('writes no audit row when nothing was marked (already paid)', async () => {
      const id = await pendingBooking();
      const hook = (client: Parameters<Parameters<BookingsRepository['markPaid']>[3] & object>[0]): Promise<void> =>
        audit.recordInTransaction(client, { organizationId: ORG, staffUserId: staffId }, 'booking.marked_paid');
      await bookings.markPaid(id, staffId, ORG, hook);
      const before = await auditRows('booking.marked_paid');

      expect(await bookings.markPaid(id, staffId, ORG, hook)).toBe(false);
      expect(await auditRows('booking.marked_paid')).toBe(before);
    });
  });

  describe('staff notes', () => {
    it('saves a note with its audit row, and neither when the audit row fails', async () => {
      const id = await pendingBooking();
      const before = await auditRows('booking.note_added');
      const input = { organizationId: ORG, propertyId: PROPERTY, bookingId: id, body: 'Deposit 50 EUR', staffId };

      const row = await notes.insert(input, (client) => audit.recordInTransaction(client, { organizationId: ORG, staffUserId: staffId }, 'booking.note_added', { targetType: 'booking', targetId: id }));
      expect(row.body).toBe('Deposit 50 EUR');
      expect(await auditRows('booking.note_added')).toBe(before + 1);

      await expect(notes.insert(input, (client) => audit.recordInTransaction(client, { organizationId: MISSING_ORG, staffUserId: staffId }, 'booking.note_added'))).rejects.toThrow();
      expect((await admin.query<{ n: string }>('SELECT count(*)::text AS n FROM booking_staff_notes WHERE inventory_block_id = $1', [id])).rows[0]?.n).toBe('1');
      expect(await auditRows('booking.note_added')).toBe(before + 1);
    });
  });

  describe('team changes', () => {
    it('changes a role together with its audit row, and not at all when the audit row fails', async () => {
      const employee = (await admin.query<{ id: string }>("SELECT id FROM staff_users WHERE email = 'eve.employee@example.com'")).rows[0]?.id ?? '';
      const before = await auditRows('team.refund_access_granted');

      await expect(
        team.changeMember(ORG, staffId, employee, { canManageRefunds: true }, (client) => audit.recordInTransaction(client, { organizationId: MISSING_ORG, staffUserId: staffId }, 'team.refund_access_granted')),
      ).rejects.toThrow();
      expect((await admin.query<{ can_manage_refunds: boolean }>('SELECT can_manage_refunds FROM staff_users WHERE id = $1', [employee])).rows[0]?.can_manage_refunds).toBe(false);
      expect(await auditRows('team.refund_access_granted')).toBe(before);

      const outcome = await team.changeMember(ORG, staffId, employee, { canManageRefunds: true }, async (client, done) => {
        await audit.recordInTransaction(client, { organizationId: ORG, staffUserId: staffId }, 'team.refund_access_granted', { targetType: 'staff_user', targetId: employee, metadata: { memberName: done.memberName } });
      });
      expect(outcome.kind).toBe('changed');
      expect((await admin.query<{ can_manage_refunds: boolean }>('SELECT can_manage_refunds FROM staff_users WHERE id = $1', [employee])).rows[0]?.can_manage_refunds).toBe(true);
      expect(await auditRows('team.refund_access_granted')).toBe(before + 1);
      const written = (await admin.query<{ metadata: { memberName: string } }>("SELECT metadata FROM audit_log WHERE action = 'team.refund_access_granted' ORDER BY created_at DESC LIMIT 1")).rows[0];
      expect(written?.metadata.memberName).toBe('Eve Employee');
    });
  });
});

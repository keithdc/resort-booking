/**
 * @file apps/api/src/shared/privacy/privacy.integration.spec.ts
 * @shared Opt-in: proves retention, erasure, export and the append-only guarantees against a real Postgres (throwaway database)
 *
 * Skipped unless DATABASE_ADMIN_URL is set (a superuser URL). The database is created, migrated (001 to the newest), given
 * the three roles, filled with a few bookings, and dropped afterwards. Name it with PRIVACY_IT_DATABASE to pick your own.
 *   DATABASE_ADMIN_URL=postgres://resort:resort@localhost:5433/postgres npx jest privacy.integration
 */

import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, Pool } from 'pg';
import { urlWithCredentials } from '../database/database-urls';
import { applyPendingMigrations, poolExecutor } from '../database/migration-files';
import { buildRoleStatements, roleOptionsFromEnv, type RoleSetupOptions } from '../database/roles';
import { eraseGuest, reapplyErasures } from './erase-guest';
import { eraseStaff } from './erase-staff';
import { assertSafeOutputPath, collectGuestExport, writeExportFile } from './export-guest';
import { DEFAULT_RETENTION } from './privacy-config';
import { preflight } from './privacy-cli';
import { poolPrivacyDb, type PrivacyDb } from './privacy-db';
import { subjectHash } from './privacy-hash';
import { recordRetentionRun, runRetention } from './retention';

const adminUrl = process.env.DATABASE_ADMIN_URL?.trim() ?? '';
const suite = adminUrl === '' ? describe.skip : describe;

const SUFFIX = randomBytes(4).toString('hex');
const DATABASE = process.env.PRIVACY_IT_DATABASE?.trim() || `resort_check_${SUFFIX}`;
const NAMES = { DB_OWNER_ROLE: `pit_owner_${SUFFIX}`, DB_APP_ROLE: `pit_app_${SUFFIX}`, DB_READONLY_ROLE: `pit_ro_${SUFFIX}` };
const PASSWORDS = { DB_OWNER_PASSWORD: `owner-${SUFFIX}-password`, DB_APP_PASSWORD: `app-${SUFFIX}-password`, DB_READONLY_PASSWORD: `readonly-${SUFFIX}-password` };
const SALT = 'integration-test-salt-0123456789abcdef';

const ORG = '11111111-1111-1111-1111-111111111111';
const PROPERTY = '22222222-2222-2222-2222-222222222221';
const HOUSE = '33333333-3333-3333-3333-333333333331';
const GUEST = 'Old.Guest@Example.com';

/** A date `days` from today (negative: in the past), as YYYY-MM-DD. */
const dayOffset = (days: number): string => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const userOf = (url: string): string => decodeURIComponent(new URL(url).username);
const passwordOf = (url: string): string => decodeURIComponent(new URL(url).password);

suite('privacy tools (real Postgres, throwaway database)', () => {
  jest.setTimeout(240_000);
  let options: RoleSetupOptions;
  let adminPool: Pool;
  let owner: Pool;
  let db: PrivacyDb;
  let appUrl = '';
  const ids: Record<string, string> = {};

  async function one<T extends Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
    const result = await adminPool.query<T>(sql, params);
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error(`no row for: ${sql}`);
    }
    return row;
  }

  async function insertBooking(label: string, fields: { kind: string; status: string; checkIn: string; checkOut: string; email: string | null; createdAgoDays?: number; expiresAt?: string }): Promise<void> {
    const row = await one<{ id: string }>(
      `INSERT INTO inventory_blocks (organization_id, property_id, house_id, kind, status, check_in, check_out, guest_count, payment_method,
         booker_name, booker_email, booker_phone, guest_note, total_cents, paid_cents, currency_code, cancel_note, creator_ip_hash, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, 2, 'card', 'Real Name', $8, '+33612345678', 'allergic to nuts', 20000, 20000, 'EUR',
         CASE WHEN $5 = 'cancelled' THEN 'called from 555' ELSE NULL END, 'iphash', now() - make_interval(days => $9::int), $10::timestamptz)
       RETURNING id`,
      [ORG, PROPERTY, HOUSE, fields.kind, fields.status, fields.checkIn, fields.checkOut, fields.email, fields.createdAgoDays ?? 0, fields.expiresAt ?? null],
    );
    ids[label] = row.id;
  }

  async function money(): Promise<string> {
    const rows = await adminPool.query(
      `SELECT 'b' AS t, id::text, status, total_cents, paid_cents, currency_code, check_in::text, check_out::text, kind FROM inventory_blocks
       UNION ALL SELECT 'p', id::text, status, amount_cents, 0, currency_code, provider_ref, purpose, '' FROM payments
       UNION ALL SELECT 'r', id::text, status, amount_cents, percent, currency_code, kind, '', '' FROM refunds ORDER BY 1, 2`,
    );
    return JSON.stringify(rows.rows);
  }

  beforeAll(async () => {
    const maintenance = new Client({ connectionString: urlWithCredentials(adminUrl, userOf(adminUrl), passwordOf(adminUrl), 'postgres') });
    await maintenance.connect();
    await maintenance.query(`CREATE DATABASE ${DATABASE}`);
    await maintenance.end();
    const databaseUrl = urlWithCredentials(adminUrl, userOf(adminUrl), passwordOf(adminUrl), DATABASE);
    adminPool = new Pool({ connectionString: databaseUrl, max: 2 });
    options = roleOptionsFromEnv({ ...PASSWORDS, ...NAMES }, DATABASE);
    await applyPendingMigrations(poolExecutor(adminPool), { appRole: options.appRole });
    for (const statement of buildRoleStatements(options)) {
      await adminPool.query(statement.sql);
    }
    owner = new Pool({ connectionString: urlWithCredentials(adminUrl, options.ownerRole, options.ownerPassword, DATABASE), max: 2 });
    db = poolPrivacyDb(owner);
    appUrl = urlWithCredentials(adminUrl, options.appRole, options.appPassword, DATABASE);

    // Bookings, in the far past and the far future so they never clash with the sample bookings of the seed migrations.
    await insertBooking('oldStay', { kind: 'reservation', status: 'confirmed', checkIn: '2019-03-01', checkOut: '2019-03-04', email: `${GUEST} ` });
    await insertBooking('oldCancelled', { kind: 'reservation', status: 'cancelled', checkIn: '2019-04-01', checkOut: '2019-04-04', email: 'other.old@example.com' });
    await insertBooking('oldOpenRefund', { kind: 'reservation', status: 'cancelled', checkIn: '2019-05-01', checkOut: '2019-05-04', email: 'refund.pending@example.com' });
    await insertBooking('recentStay', { kind: 'reservation', status: 'confirmed', checkIn: dayOffset(-40), checkOut: dayOffset(-37), email: GUEST.toLowerCase() });
    await insertBooking('futureStay', { kind: 'reservation', status: 'confirmed', checkIn: '2090-01-01', checkOut: '2090-01-04', email: GUEST.toUpperCase() });
    await insertBooking('oldHold', { kind: 'hold', status: 'expired', checkIn: '2020-07-01', checkOut: '2020-07-03', email: 'abandoned@example.com', createdAgoDays: 100, expiresAt: '2020-01-01T00:00:00Z' });
    await insertBooking('freshHold', { kind: 'hold', status: 'expired', checkIn: '2020-08-01', checkOut: '2020-08-03', email: 'fresh.hold@example.com', createdAgoDays: 2, expiresAt: '2020-01-01T00:00:00Z' });
    await insertBooking('bystander', { kind: 'reservation', status: 'confirmed', checkIn: '2091-01-01', checkOut: '2091-01-03', email: 'bystander@example.com' });

    for (const label of ['oldStay', 'oldCancelled', 'oldOpenRefund']) {
      await one(
        `INSERT INTO payments (organization_id, property_id, inventory_block_id, provider, provider_ref, amount_cents, currency_code, status, purpose)
         VALUES ($1, $2, $3, 'mock', $4, 20000, 'EUR', 'succeeded', 'booking') RETURNING id`,
        [ORG, PROPERTY, ids[label], `pi_${label}`],
      );
    }
    await one(
      `INSERT INTO refunds (organization_id, property_id, inventory_block_id, provider, amount_cents, percent, currency_code, status, reason, initiated_by, kind, resolution_note)
       VALUES ($1, $2, $3, 'manual', 10000, 50, 'EUR', 'succeeded', 'Cancelled by guest', 'guest', 'cancellation', 'sent by bank transfer to John Doe') RETURNING id`,
      [ORG, PROPERTY, ids.oldCancelled],
    );
    await one(
      `INSERT INTO refunds (organization_id, property_id, inventory_block_id, provider, amount_cents, percent, currency_code, status, reason, initiated_by, kind)
       VALUES ($1, $2, $3, 'manual', 10000, 50, 'EUR', 'pending', 'Cancelled by guest', 'guest', 'cancellation') RETURNING id`,
      [ORG, PROPERTY, ids.oldOpenRefund],
    );

    await adminPool.query(
      `INSERT INTO audit_log (organization_id, action, ip_hash, metadata, created_at) VALUES
        ($1, 'old.row', 'h1', '{"actorName":"Ada Staff"}', now() - interval '800 days'),
        ($1, 'mid.row', 'h2', '{"actorName":"Ada Staff"}', now() - interval '400 days'),
        ($1, 'young.row', 'h3', '{"actorName":"Ada Staff"}', now() - interval '10 days'),
        (NULL, 'auth.login_failed', 'h4', '{"emailHash":"abc"}', now() - interval '100 days'),
        (NULL, 'auth.login_failed', 'h5', '{"emailHash":"abc"}', now() - interval '5 days')`,
      [ORG],
    );
    await adminPool.query(
      `INSERT INTO staff_invites (organization_id, email, full_name, role, token_hash, expires_at) VALUES
        ($1, 'old.invite@example.com', 'Old Invitee', 'employee', 'tok-old', now() - interval '60 days'),
        ($1, 'open.invite@example.com', 'Open Invitee', 'employee', 'tok-open', now() + interval '2 days')`,
      [ORG],
    );
    await adminPool.query(
      `INSERT INTO payment_webhook_events (provider, provider_event_id, type, status, payload_sha256, received_at) VALUES
        ('mock', 'evt_old', 't', 'processed', repeat('a', 64), now() - interval '200 days'),
        ('mock', 'evt_old_failed', 't', 'failed', repeat('b', 64), now() - interval '200 days'),
        ('mock', 'evt_new', 't', 'processed', repeat('c', 64), now() - interval '1 day')`,
    );
    const staff = await one<{ id: string }>(
      `INSERT INTO staff_users (organization_id, full_name, email, password_hash, role) VALUES ($1, 'Eve Employee', 'eve@example.com', 'x:y', 'employee') RETURNING id`,
      [ORG],
    );
    ids.employee = staff.id;
    await adminPool.query(`INSERT INTO staff_sessions (staff_user_id, token_hash, expires_at) VALUES ($1, 'sess-expired', now() - interval '3 days'), ($1, 'sess-live', now() + interval '3 days')`, [staff.id]);
    await adminPool.query(`INSERT INTO audit_log (organization_id, staff_user_id, action, ip_hash, metadata) VALUES ($1, $2, 'booking.cancelled_by_staff', 'h6', '{"actorName":"Eve Employee"}')`, [ORG, staff.id]);
    const admin = await one<{ id: string }>(
      `INSERT INTO staff_users (organization_id, full_name, email, password_hash, role) VALUES ($1, 'Sole Admin', 'sole@example.com', 'x:y', 'admin') RETURNING id`,
      [ORG],
    );
    ids.admin = admin.id;
  });

  afterAll(async () => {
    await owner.end();
    await adminPool.end();
    const maintenance = new Client({ connectionString: urlWithCredentials(adminUrl, userOf(adminUrl), passwordOf(adminUrl), 'postgres') });
    await maintenance.connect();
    await maintenance.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    for (const role of Object.values(NAMES)) {
      await maintenance.query(`DROP ROLE IF EXISTS ${role}`);
    }
    await maintenance.end();
  });

  it('refuses the API role (resort_app), up front and at the privilege level', async () => {
    const app = new Pool({ connectionString: appUrl, max: 1 });
    try {
      await expect(preflight(poolPrivacyDb(app))).rejects.toThrow(/not allowed to run this/);
      await expect(runRetention(poolPrivacyDb(app), { apply: true, config: DEFAULT_RETENTION })).rejects.toMatchObject({ code: '42501' });
      await expect(app.query('SELECT count(*) FROM privacy_erasure_ledger')).rejects.toMatchObject({ code: '42501' });
    } finally {
      await app.end();
    }
    expect(await preflight(db)).toBe(options.ownerRole);
  });

  it('keeps the append-only guards for the owner without the maintenance switch', async () => {
    await expect(owner.query("UPDATE audit_log SET action = 'x'")).rejects.toThrow(/append-only/);
    await expect(owner.query('DELETE FROM audit_log')).rejects.toThrow(/append-only/);
    await expect(owner.query('DELETE FROM refunds')).rejects.toThrow(/cannot be deleted/);
    await expect(owner.query('UPDATE booking_changes SET note = NULL')).resolves.toBeDefined(); // no rows: the row trigger never fires
    await expect(owner.query("UPDATE refunds SET resolution_note = 'x' WHERE status = 'succeeded'")).rejects.toThrow(/succeeded refund cannot be changed/);
  });

  it('a dry run counts what is due and changes nothing', async () => {
    const before = JSON.stringify([(await adminPool.query('SELECT * FROM inventory_blocks ORDER BY id')).rows, (await adminPool.query('SELECT * FROM audit_log ORDER BY id')).rows]);

    const report = await runRetention(db, { apply: false, config: DEFAULT_RETENTION });

    const rows = Object.fromEntries(report.steps.map((step) => [step.id, step.rows]));
    expect(rows).toMatchObject({ guest_stays: 2, abandoned_holds: 1, staff_invites: 1, staff_sessions: 1, webhook_events: 1, audit_prune: 1, audit_orphans: 1, audit_anonymise: 2 });
    expect(report.steps.find((step) => step.id === 'guest_stays')?.deferred).toBe(1);
    const after = JSON.stringify([(await adminPool.query('SELECT * FROM inventory_blocks ORDER BY id')).rows, (await adminPool.query('SELECT * FROM audit_log ORDER BY id')).rows]);
    expect(after).toBe(before);
  });

  it('exports everything held about a guest to a 0600 file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'privacy-it-'));
    try {
      const path = assertSafeOutputPath(join(dir, 'guest.json'));
      const data = await collectGuestExport(db, ` ${GUEST.toUpperCase()}`);
      await writeExportFile(path, data);

      expect((await stat(path)).mode & 0o777).toBe(0o600);
      const parsed = JSON.parse(await readFile(path, 'utf8')) as { bookings: { reference: string; booker_phone: string }[]; payments: unknown[] };
      expect(parsed.bookings).toHaveLength(3);
      expect(parsed.bookings[0]?.reference).toMatch(/^BK-[0-9A-F]{10}$/);
      expect(parsed.bookings[0]?.booker_phone).toBe('+33612345678');
      expect(parsed.payments).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('apply anonymises people, keeps every financial column, and leaves the rest alone', async () => {
    const financialBefore = await money();

    const report = await runRetention(db, { apply: true, config: { ...DEFAULT_RETENTION, batchSize: 2 } });

    expect(report.steps.find((step) => step.id === 'guest_stays')).toMatchObject({ rows: 2, batches: 2, deferred: 1 });
    expect(await money()).toBe(financialBefore);

    const old = await one<Record<string, unknown>>('SELECT * FROM inventory_blocks WHERE id = $1', [ids.oldStay]);
    expect(old).toMatchObject({ booker_name: 'Anonymised guest', booker_email: null, booker_phone: null, guest_note: '', creator_ip_hash: null });
    expect(old.anonymised_at).toBeInstanceOf(Date);
    expect((await one<{ cancel_note: string }>('SELECT cancel_note FROM inventory_blocks WHERE id = $1', [ids.oldCancelled])).cancel_note).toBe('[removed]');
    expect((await one<{ resolution_note: string }>('SELECT resolution_note FROM refunds WHERE inventory_block_id = $1', [ids.oldCancelled])).resolution_note).toBe('[removed]');

    expect((await one<{ booker_email: string; anonymised_at: null }>('SELECT booker_email, anonymised_at FROM inventory_blocks WHERE id = $1', [ids.oldOpenRefund])).anonymised_at).toBeNull();
    expect((await one<{ booker_email: string }>('SELECT booker_email FROM inventory_blocks WHERE id = $1', [ids.recentStay])).booker_email).toBe(GUEST.toLowerCase());
    expect((await one<{ booker_name: string }>('SELECT booker_name FROM inventory_blocks WHERE id = $1', [ids.oldHold])).booker_name).toBe('Anonymised guest');
    expect((await one<{ booker_name: string }>('SELECT booker_name FROM inventory_blocks WHERE id = $1', [ids.freshHold])).booker_name).toBe('Real Name');

    expect((await one<{ n: string }>(`SELECT count(*) AS n FROM staff_invites WHERE token_hash = 'tok-old'`)).n).toBe('0');
    expect((await one<{ n: string }>(`SELECT count(*) AS n FROM staff_invites WHERE token_hash = 'tok-open'`)).n).toBe('1');
    expect((await one<{ n: string }>(`SELECT count(*) AS n FROM staff_sessions WHERE token_hash = 'sess-expired'`)).n).toBe('0');
    expect((await one<{ n: string }>(`SELECT count(*) AS n FROM staff_sessions WHERE token_hash = 'sess-live'`)).n).toBe('1');
    expect((await one<{ n: string }>(`SELECT count(*) AS n FROM payment_webhook_events`)).n).toBe('2');
    expect((await one<{ n: string }>(`SELECT count(*) AS n FROM audit_log WHERE action = 'old.row'`)).n).toBe('0');
    expect((await one<{ n: string }>(`SELECT count(*) AS n FROM audit_log WHERE organization_id IS NULL AND created_at < now() - interval '50 days'`)).n).toBe('0');
    const mid = await one<{ ip_hash: string | null; metadata: { actorName: string } }>(`SELECT ip_hash, metadata FROM audit_log WHERE action = 'mid.row'`);
    expect(mid.ip_hash).toBeNull();
    expect(mid.metadata.actorName).toBe('[removed]');
    expect((await one<{ ip_hash: string }>(`SELECT ip_hash FROM audit_log WHERE action = 'young.row'`)).ip_hash).toBe('h3');

    expect(await recordRetentionRun(db, report, DEFAULT_RETENTION, 'integration')).toBe(true);
    expect((await one<{ n: string }>(`SELECT count(*) AS n FROM audit_log WHERE action = 'privacy.retention_run'`)).n).toBe('1');
  });

  it('is idempotent: a second run finds nothing and changes nothing', async () => {
    const financialBefore = await money();

    const report = await runRetention(db, { apply: true, config: DEFAULT_RETENTION });

    expect(report.totalRows).toBe(0);
    expect(await money()).toBe(financialBefore);
  });

  it('erases a guest by email: dry run first, skips the future stay, ledger and audit hold only a hash', async () => {
    const dry = await eraseGuest(db, { email: ` ${GUEST.toUpperCase()} `, apply: false, forceFuture: false, operator: 'it', salt: SALT });
    expect(dry).toMatchObject({ found: 2 });
    expect(dry.erased).toHaveLength(1);
    expect(dry.skipped.map((item) => item.reasons)).toEqual([['future_stay']]);
    expect((await one<{ n: string }>('SELECT count(*) AS n FROM privacy_erasure_ledger')).n).toBe('0');

    const financialBefore = await money();
    const receipt = await eraseGuest(db, { email: GUEST, apply: true, forceFuture: false, operator: 'it', salt: SALT });

    expect(receipt.erased).toHaveLength(1);
    expect(receipt.skipped).toHaveLength(1);
    expect(await money()).toBe(financialBefore);
    expect((await one<{ booker_email: string | null }>('SELECT booker_email FROM inventory_blocks WHERE id = $1', [ids.recentStay])).booker_email).toBeNull();
    expect((await one<{ booker_email: string | null }>('SELECT booker_email FROM inventory_blocks WHERE id = $1', [ids.futureStay])).booker_email).not.toBeNull();
    const ledger = await one<{ subject_hash: string; bookings_anonymised: number }>('SELECT subject_hash, bookings_anonymised FROM privacy_erasure_ledger');
    expect(ledger).toEqual({ subject_hash: subjectHash(GUEST, SALT), bookings_anonymised: 1 });
    const audit = await adminPool.query<{ metadata: unknown; target_id: string }>(`SELECT metadata, target_id FROM audit_log WHERE action = 'privacy.guest_erased'`);
    expect(audit.rows).toHaveLength(1);
    expect(JSON.stringify(audit.rows)).not.toMatch(/old\.guest|example\.com/i);
  });

  it('--force-future erases the rest, and a repeat finds nothing left', async () => {
    const forced = await eraseGuest(db, { email: GUEST, apply: true, forceFuture: true, operator: 'it', salt: SALT });
    expect(forced.erased).toHaveLength(1);
    expect(forced.forced).toBe(true);

    const again = await eraseGuest(db, { email: GUEST, apply: true, forceFuture: true, operator: 'it', salt: SALT });
    expect(again.found).toBe(0);
  });

  it('re-applies erasures after a backup restore brings the person back', async () => {
    await insertBooking('restored', { kind: 'reservation', status: 'confirmed', checkIn: '2018-01-01', checkOut: '2018-01-03', email: GUEST });

    const dry = await reapplyErasures(db, { apply: false, salt: SALT });
    expect(dry.emailsMatched).toBe(1);
    const done = await reapplyErasures(db, { apply: true, salt: SALT });

    expect(done.bookingsAnonymised).toBe(1);
    expect((await one<{ booker_email: string | null }>('SELECT booker_email FROM inventory_blocks WHERE id = $1', [ids.restored])).booker_email).toBeNull();
    expect((await one<{ booker_email: string }>('SELECT booker_email FROM inventory_blocks WHERE id = $1', [ids.bystander])).booker_email).toBe('bystander@example.com');
  });

  it('keeps the ledger append-only for the owner', async () => {
    await expect(owner.query('DELETE FROM privacy_erasure_ledger')).rejects.toThrow(/append-only/);
  });

  it('erases a staff member (row and audit linkage stay) and refuses the last admin', async () => {
    const refused = await eraseStaff(db, { email: 'sole@example.com', apply: true, operator: 'it', salt: SALT });
    expect(refused.refused).toBe('last_admin');

    const receipt = await eraseStaff(db, { email: 'EVE@example.com', apply: true, operator: 'it', salt: SALT });

    expect(receipt).toMatchObject({ found: true, sessionsRemoved: 1, auditRowsScrubbed: 1 });
    const user = await one<{ full_name: string; email: string; active: boolean }>('SELECT full_name, email, active FROM staff_users WHERE id = $1', [ids.employee]);
    expect(user).toEqual({ full_name: 'Former staff member', email: `erased-${ids.employee}@erased.invalid`, active: false });
    const audit = await one<{ ip_hash: string | null; metadata: { actorName: string } }>('SELECT ip_hash, metadata FROM audit_log WHERE staff_user_id = $1', [ids.employee]);
    expect(audit.ip_hash).toBeNull();
    expect(audit.metadata.actorName).toBe('[removed]');
    expect((await eraseStaff(db, { email: 'eve@example.com', apply: true, operator: 'it', salt: SALT })).found).toBe(false);
  });
});

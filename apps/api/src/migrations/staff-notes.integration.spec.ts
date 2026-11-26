/**
 * @file apps/api/src/migrations/staff-notes.integration.spec.ts
 * @shared Opt-in: proves migration 043 (staff notes on a booking) against a real Postgres (throwaway database)
 *
 * Skipped unless DATABASE_ADMIN_URL is set (a superuser URL). The database is created, migrated (001 to the newest),
 * given the three roles, and dropped afterwards.
 *   DATABASE_ADMIN_URL=postgres://resort:resort@localhost:5433/postgres npx jest staff-notes.integration
 */

import { randomBytes } from 'node:crypto';
import { Client, Pool } from 'pg';
import { urlWithCredentials } from '../shared/database/database-urls';
import { applyPendingMigrations, poolExecutor } from '../shared/database/migration-files';
import { buildRoleStatements, roleOptionsFromEnv, type RoleSetupOptions } from '../shared/database/roles';
import { anonymiseBookingsSql, ANONYMISED_NAME, REMOVED_TEXT } from '../shared/privacy/anonymise-sql';

const adminUrl = process.env.DATABASE_ADMIN_URL?.trim() ?? '';
const suite = adminUrl === '' ? describe.skip : describe;

const SUFFIX = randomBytes(4).toString('hex');
const DATABASE = `resort_check_${SUFFIX}`;
const NAMES = { DB_OWNER_ROLE: `snt_owner_${SUFFIX}`, DB_APP_ROLE: `snt_app_${SUFFIX}`, DB_READONLY_ROLE: `snt_ro_${SUFFIX}` };
const PASSWORDS = { DB_OWNER_PASSWORD: `owner-${SUFFIX}-password`, DB_APP_PASSWORD: `app-${SUFFIX}-password`, DB_READONLY_PASSWORD: `readonly-${SUFFIX}-password` };

const ORG = '11111111-1111-1111-1111-111111111111';
const PROPERTY = '22222222-2222-2222-2222-222222222221';
const HOUSE = '33333333-3333-3333-3333-333333333331';

const userOf = (url: string): string => decodeURIComponent(new URL(url).username);
const passwordOf = (url: string): string => decodeURIComponent(new URL(url).password);

suite('staff notes on a booking (real Postgres, throwaway database)', () => {
  jest.setTimeout(240_000);
  let admin: Pool;
  let app: Pool;
  let readonly: Pool;
  let staffId = '';
  let night = 0;

  async function booking(): Promise<string> {
    night += 3;
    const start = new Date(Date.UTC(2096, 0, 1) + night * 86_400_000).toISOString().slice(0, 10);
    const end = new Date(Date.UTC(2096, 0, 1) + (night + 2) * 86_400_000).toISOString().slice(0, 10);
    const result = await app.query<{ id: string }>(
      `INSERT INTO inventory_blocks (organization_id, property_id, house_id, kind, status, check_in, check_out, guest_count, payment_method, payment_status,
         booker_name, booker_email, guest_note, total_cents, paid_cents, currency_code)
       VALUES ($1, $2, $3, 'reservation', 'confirmed', $4::date, $5::date, 2, 'pay_at_hotel', 'pending', 'Ada Guest', 'ada@example.com', 'late arrival', 96000, 0, 'EUR') RETURNING id`,
      [ORG, PROPERTY, HOUSE, start, end],
    );
    return result.rows[0]?.id ?? '';
  }

  async function note(pool: Pool, bookingId: string, body = 'Deposit of 50 EUR taken in cash'): Promise<string> {
    const result = await pool.query<{ id: string }>(
      `INSERT INTO booking_staff_notes (organization_id, property_id, inventory_block_id, body, created_by_staff_id) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [ORG, PROPERTY, bookingId, body, staffId],
    );
    return result.rows[0]?.id ?? '';
  }

  const failure = async (pool: Pool, sql: string, params: unknown[] = []): Promise<string> => {
    try {
      await pool.query(sql, params);
    } catch (error: unknown) {
      return error instanceof Error ? error.message : String(error);
    }
    return '';
  };

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
    app = new Pool({ connectionString: urlWithCredentials(adminUrl, options.appRole, options.appPassword, DATABASE), max: 2 });
    readonly = new Pool({ connectionString: urlWithCredentials(adminUrl, options.readonlyRole, options.readonlyPassword, DATABASE), max: 1 });
    const staff = await admin.query<{ id: string }>(
      `INSERT INTO staff_users (organization_id, full_name, email, password_hash, role) VALUES ($1, 'Eve Employee', 'eve@example.com', 'x:y', 'employee') RETURNING id`,
      [ORG],
    );
    staffId = staff.rows[0]?.id ?? '';
  });

  afterAll(async () => {
    await readonly.end();
    await app.end();
    await admin.end();
    const maintenance = new Client({ connectionString: urlWithCredentials(adminUrl, userOf(adminUrl), passwordOf(adminUrl), 'postgres') });
    await maintenance.connect();
    await maintenance.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    for (const role of Object.values(NAMES)) {
      await maintenance.query(`DROP ROLE IF EXISTS ${role}`);
    }
    await maintenance.end();
  });

  it('lets the app role add and read notes, and keeps the author and time', async () => {
    const id = await booking();
    const noteId = await note(app, id);
    const row = await app.query<{ body: string; created_by_staff_id: string; deleted_at: Date | null }>('SELECT body, created_by_staff_id, deleted_at FROM booking_staff_notes WHERE id = $1', [noteId]);
    expect(row.rows[0]).toMatchObject({ body: 'Deposit of 50 EUR taken in cash', created_by_staff_id: staffId, deleted_at: null });
  });

  it('refuses an empty note and one over 2000 characters', async () => {
    const id = await booking();
    expect(await failure(app, `INSERT INTO booking_staff_notes (organization_id, property_id, inventory_block_id, body) VALUES ($1, $2, $3, '')`, [ORG, PROPERTY, id])).toContain('booking_staff_notes_body_check');
    expect(await failure(app, `INSERT INTO booking_staff_notes (organization_id, property_id, inventory_block_id, body) VALUES ($1, $2, $3, $4)`, [ORG, PROPERTY, id, 'a'.repeat(2001)])).toContain('booking_staff_notes_body_check');
    expect(await failure(app, `INSERT INTO booking_staff_notes (organization_id, property_id, inventory_block_id, body) VALUES ($1, $2, $3, $4)`, [ORG, PROPERTY, id, 'a'.repeat(2000)])).toBe('');
  });

  it('ties a note to the booking and the property of the SAME organization', async () => {
    const other = await admin.query<{ id: string }>(`INSERT INTO organizations (name) VALUES ('Other Org ${SUFFIX}') RETURNING id`);
    const otherOrg = other.rows[0]?.id ?? '';
    const id = await booking();

    expect(await failure(app, `INSERT INTO booking_staff_notes (organization_id, property_id, inventory_block_id, body) VALUES ($1, $2, $3, 'x')`, [otherOrg, PROPERTY, id])).toContain('booking_staff_notes_');
  });

  it('never lets the app role delete a note or change its text, author or booking', async () => {
    const id = await booking();
    const noteId = await note(app, id);

    expect(await failure(app, 'DELETE FROM booking_staff_notes WHERE id = $1', [noteId])).toContain('permission denied');
    expect(await failure(app, `UPDATE booking_staff_notes SET body = 'changed' WHERE id = $1`, [noteId])).toContain('permission denied');
    expect(await failure(app, 'UPDATE booking_staff_notes SET created_by_staff_id = NULL WHERE id = $1', [noteId])).toContain('permission denied');
    expect(await failure(app, 'UPDATE booking_staff_notes SET inventory_block_id = $2 WHERE id = $1', [noteId, await booking()])).toContain('permission denied');
  });

  it('hides a note exactly like the API does, once, and never brings it back', async () => {
    const id = await booking();
    const noteId = await note(app, id);
    const hide = `UPDATE booking_staff_notes SET deleted_at = now(), deleted_by_staff_id = $4
      WHERE id = $1 AND inventory_block_id = $2 AND organization_id = $3 AND deleted_at IS NULL`;

    expect((await app.query(hide, [noteId, id, ORG, staffId])).rowCount).toBe(1);
    expect((await app.query(hide, [noteId, id, ORG, staffId])).rowCount).toBe(0);
    expect(await failure(app, 'UPDATE booking_staff_notes SET deleted_at = NULL, deleted_by_staff_id = NULL WHERE id = $1', [noteId])).toContain('a hidden staff note stays hidden');
    expect(await failure(admin, 'UPDATE booking_staff_notes SET deleted_at = NULL, deleted_by_staff_id = NULL WHERE id = $1', [noteId])).toContain('a hidden staff note stays hidden');
    const row = await admin.query<{ body: string }>('SELECT body FROM booking_staff_notes WHERE id = $1', [noteId]);
    expect(row.rows[0]?.body).toBe('Deposit of 50 EUR taken in cash');
  });

  it('stops even the owner from editing text or deleting a row, except in a maintenance transaction', async () => {
    const id = await booking();
    const noteId = await note(admin, id);

    expect(await failure(admin, `UPDATE booking_staff_notes SET body = 'changed' WHERE id = $1`, [noteId])).toContain('a staff note is never edited');
    expect(await failure(admin, 'DELETE FROM booking_staff_notes WHERE id = $1', [noteId])).toContain('rows are not deleted');

    const client = await admin.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL resort.record_maintenance = 'on'`);
      await client.query(`UPDATE booking_staff_notes SET body = 'scrubbed' WHERE id = $1`, [noteId]);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    const row = await admin.query<{ body: string }>('SELECT body FROM booking_staff_notes WHERE id = $1', [noteId]);
    expect(row.rows[0]?.body).toBe('scrubbed');
  });

  it('scrubs the note text when the booking is anonymised (retention and erasure share this statement)', async () => {
    const id = await booking();
    const first = await note(admin, id, 'Guest Ada Guest asked for a quiet room, phone +33 6 12 34 56 78');
    const second = await note(admin, id, 'Second note');
    const other = await booking();
    const untouched = await note(admin, other, 'Another booking, not erased');
    const client = await admin.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL resort.record_maintenance = 'on'`);
      const done = await client.query<{ n: number; staff_notes: number }>(
        anonymiseBookingsSql('SELECT ib.id FROM inventory_blocks ib WHERE ib.id = ANY($3::uuid[]) AND ib.anonymised_at IS NULL'),
        [ANONYMISED_NAME, REMOVED_TEXT, [id]],
      );
      await client.query('COMMIT');
      expect(done.rows[0]).toMatchObject({ n: 1, staff_notes: 2 });
    } finally {
      client.release();
    }
    const rows = await admin.query<{ id: string; body: string }>('SELECT id, body FROM booking_staff_notes WHERE id = ANY($1::uuid[])', [[first, second, untouched]]);
    const byId = new Map(rows.rows.map((row) => [row.id, row.body]));
    expect(byId.get(first)).toBe(REMOVED_TEXT);
    expect(byId.get(second)).toBe(REMOVED_TEXT);
    expect(byId.get(untouched)).toBe('Another booking, not erased');
  });

  it('is invisible to the read-only role and to every report view', async () => {
    expect(await failure(readonly, 'SELECT body FROM booking_staff_notes')).toContain('permission denied');
    const columns = await admin.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name LIKE 'report\\_%' AND (column_name ILIKE '%note%' OR column_name = 'body')`,
    );
    expect(columns.rows.filter((row) => row.column_name !== 'cancel_note' || !row.table_name.startsWith('report_'))).toEqual([]);
  });
});

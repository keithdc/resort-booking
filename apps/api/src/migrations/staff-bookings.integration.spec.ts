/**
 * @file apps/api/src/migrations/staff-bookings.integration.spec.ts
 * @shared Opt-in: proves migration 040 (pay-at-hotel bookings, payment status) against a real Postgres (throwaway database)
 *
 * Skipped unless DATABASE_ADMIN_URL is set (a superuser URL). The database is created, migrated (001 to the newest),
 * given the three roles, and dropped afterwards.
 *   DATABASE_ADMIN_URL=postgres://resort:resort@localhost:5433/postgres npx jest staff-bookings.integration
 */

import { randomBytes } from 'node:crypto';
import { Client, Pool } from 'pg';
import { urlWithCredentials } from '../shared/database/database-urls';
import { applyPendingMigrations, poolExecutor } from '../shared/database/migration-files';
import { buildRoleStatements, roleOptionsFromEnv, type RoleSetupOptions } from '../shared/database/roles';

const adminUrl = process.env.DATABASE_ADMIN_URL?.trim() ?? '';
const suite = adminUrl === '' ? describe.skip : describe;

const SUFFIX = randomBytes(4).toString('hex');
const DATABASE = `resort_check_${SUFFIX}`;
const NAMES = { DB_OWNER_ROLE: `sbk_owner_${SUFFIX}`, DB_APP_ROLE: `sbk_app_${SUFFIX}`, DB_READONLY_ROLE: `sbk_ro_${SUFFIX}` };
const PASSWORDS = { DB_OWNER_PASSWORD: `owner-${SUFFIX}-password`, DB_APP_PASSWORD: `app-${SUFFIX}-password`, DB_READONLY_PASSWORD: `readonly-${SUFFIX}-password` };

const ORG = '11111111-1111-1111-1111-111111111111';
const PROPERTY = '22222222-2222-2222-2222-222222222221';
const HOUSE = '33333333-3333-3333-3333-333333333331';

const userOf = (url: string): string => decodeURIComponent(new URL(url).username);
const passwordOf = (url: string): string => decodeURIComponent(new URL(url).password);

suite('staff bookings and payment status (real Postgres, throwaway database)', () => {
  jest.setTimeout(240_000);
  let admin: Pool;
  let app: Pool;
  let staffId = '';
  let night = 0;

  /** A booking row; each call takes its own far-future dates so none clash. */
  async function insert(pool: Pool, fields: { method: string | null; status: string; paid: number | null; paidAt?: string | null; kind?: string; bookingStatus?: string }): Promise<string> {
    night += 3;
    const start = new Date(Date.UTC(2095, 0, 1) + night * 86_400_000).toISOString().slice(0, 10);
    const end = new Date(Date.UTC(2095, 0, 1) + (night + 2) * 86_400_000).toISOString().slice(0, 10);
    const result = await pool.query<{ id: string }>(
      `INSERT INTO inventory_blocks (organization_id, property_id, house_id, kind, status, check_in, check_out, guest_count, payment_method, payment_status,
         booker_name, booker_email, total_cents, paid_cents, paid_at, currency_code, created_by_staff_id)
       VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, 2, $8, $9, 'Ada', 'ada@example.com', 96000, $10, $11::timestamptz, 'EUR', $12) RETURNING id`,
      [ORG, PROPERTY, HOUSE, fields.kind ?? 'reservation', fields.bookingStatus ?? 'confirmed', start, end, fields.method, fields.status, fields.paid, fields.paidAt ?? null, staffId],
    );
    const row = result.rows[0];
    if (row === undefined) {
      throw new Error('no row');
    }
    return row.id;
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
    const staff = await admin.query<{ id: string }>(
      `INSERT INTO staff_users (organization_id, full_name, email, password_hash, role) VALUES ($1, 'Eve Employee', 'eve@example.com', 'x:y', 'employee') RETURNING id`,
      [ORG],
    );
    staffId = staff.rows[0]?.id ?? '';
  });

  afterAll(async () => {
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

  it('counts every booking that existed before as paid', async () => {
    const rows = await admin.query<{ n: string }>(`SELECT count(*) AS n FROM inventory_blocks WHERE payment_status <> 'paid' OR paid_at IS NOT NULL`);
    expect(rows.rows[0]?.n).toBe('0');
  });

  it('lets the app role make a pending pay-at-hotel booking with nothing paid', async () => {
    const id = await insert(app, { method: 'pay_at_hotel', status: 'pending', paid: 0 });
    const row = await admin.query<{ payment_status: string; paid_cents: number; created_by_staff_id: string }>(
      'SELECT payment_status, paid_cents, created_by_staff_id FROM inventory_blocks WHERE id = $1',
      [id],
    );
    expect(row.rows[0]).toEqual({ payment_status: 'pending', paid_cents: 0, created_by_staff_id: staffId });
  });

  it('refuses a payment method nobody offers, and a pending booking that is not pay at hotel or has money on it', async () => {
    expect(await failure(admin, `UPDATE inventory_blocks SET payment_method = 'cash' WHERE id = (SELECT id FROM inventory_blocks LIMIT 1)`)).toContain('inventory_blocks_payment_method_check');
    expect(await failure(app, `INSERT INTO inventory_blocks (organization_id, property_id, house_id, kind, status, check_in, check_out, payment_method, payment_status, paid_cents)
      VALUES ($1, $2, $3, 'reservation', 'confirmed', '2099-01-01', '2099-01-03', 'card', 'pending', 0)`, [ORG, PROPERTY, HOUSE])).toContain('inventory_blocks_pending_is_unpaid');
    expect(await failure(app, `INSERT INTO inventory_blocks (organization_id, property_id, house_id, kind, status, check_in, check_out, payment_method, payment_status, paid_cents)
      VALUES ($1, $2, $3, 'reservation', 'confirmed', '2099-01-01', '2099-01-03', 'pay_at_hotel', 'pending', 500)`, [ORG, PROPERTY, HOUSE])).toContain('inventory_blocks_pending_is_unpaid');
    expect(await failure(app, `INSERT INTO inventory_blocks (organization_id, property_id, house_id, kind, status, check_in, check_out, payment_method, payment_status)
      VALUES ($1, $2, $3, 'reservation', 'confirmed', '2099-01-01', '2099-01-03', 'pay_at_hotel', 'maybe')`, [ORG, PROPERTY, HOUSE])).toContain('inventory_blocks_payment_status_check');
  });

  it('moves pending to paid exactly like the API does, once', async () => {
    const id = await insert(app, { method: 'pay_at_hotel', status: 'pending', paid: 0 });
    const mark = `UPDATE inventory_blocks SET payment_status = 'paid', paid_at = now(), paid_cents = COALESCE(total_cents, 0), marked_paid_by_staff_id = $2
      WHERE id = $1 AND payment_status = 'pending' AND payment_method = 'pay_at_hotel'`;

    expect((await app.query(mark, [id, staffId])).rowCount).toBe(1);
    expect((await app.query(mark, [id, staffId])).rowCount).toBe(0);
    const row = await admin.query<{ payment_status: string; paid_cents: number; marked_paid_by_staff_id: string; paid_at: Date }>(
      'SELECT payment_status, paid_cents, marked_paid_by_staff_id, paid_at FROM inventory_blocks WHERE id = $1',
      [id],
    );
    expect(row.rows[0]).toMatchObject({ payment_status: 'paid', paid_cents: 96000, marked_paid_by_staff_id: staffId });
    expect(row.rows[0]?.paid_at).toBeInstanceOf(Date);
  });

  it('never lets a paid booking go back to pending, even for the owner role, and needs a time to mark one paid', async () => {
    const paid = await insert(admin, { method: 'pay_at_hotel', status: 'paid', paid: 96000, paidAt: '2026-01-01T10:00:00Z' });
    expect(await failure(admin, `UPDATE inventory_blocks SET payment_status = 'pending', paid_cents = 0, paid_at = NULL WHERE id = $1`, [paid])).toContain('cannot go back to pending');
    expect(await failure(app, `UPDATE inventory_blocks SET payment_status = 'pending' WHERE id = $1`, [paid])).toContain('cannot go back to pending');

    const pending = await insert(admin, { method: 'pay_at_hotel', status: 'pending', paid: 0 });
    expect(await failure(admin, `UPDATE inventory_blocks SET payment_status = 'paid', paid_cents = 96000 WHERE id = $1`, [pending])).toContain('needs paid_at');
  });

  it('leaves the maintenance escape hatch for an owner-run job, inside one transaction', async () => {
    const paid = await insert(admin, { method: 'pay_at_hotel', status: 'paid', paid: 96000, paidAt: '2026-01-01T10:00:00Z' });
    const client = await admin.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL resort.record_maintenance = 'on'`);
      await client.query(`UPDATE inventory_blocks SET payment_status = 'pending', paid_cents = 0, paid_at = NULL WHERE id = $1`, [paid]);
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    const row = await admin.query<{ payment_status: string }>('SELECT payment_status FROM inventory_blocks WHERE id = $1', [paid]);
    expect(row.rows[0]?.payment_status).toBe('paid');
  });

  it('keeps a pending booking in the calendar: the same dates cannot be booked twice, and cancelling frees them', async () => {
    const id = await insert(app, { method: 'pay_at_hotel', status: 'pending', paid: 0 });
    const dates = await admin.query<{ check_in: string; check_out: string }>('SELECT check_in::text, check_out::text FROM inventory_blocks WHERE id = $1', [id]);
    const { check_in: checkIn, check_out: checkOut } = dates.rows[0] ?? { check_in: '', check_out: '' };
    const again = `INSERT INTO inventory_blocks (organization_id, property_id, house_id, kind, status, check_in, check_out, payment_method, payment_status, paid_cents)
      VALUES ($1, $2, $3, 'reservation', 'confirmed', $4, $5, 'pay_at_hotel', 'pending', 0)`;

    expect(await failure(app, again, [ORG, PROPERTY, HOUSE, checkIn, checkOut])).toContain('inventory_blocks_no_overlap');
    await app.query(`UPDATE inventory_blocks SET status = 'cancelled', cancelled_at = now() WHERE id = $1`, [id]);
    expect(await failure(app, again, [ORG, PROPERTY, HOUSE, checkIn, checkOut])).toBe('');
  });
});

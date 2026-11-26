/**
 * @file apps/api/src/migrations/staff-bookings.integration.spec.ts
 * @shared Opt-in: proves migrations 040 (pay-at-hotel bookings, payment status), 041 (extras on a booking) and 042 (report view) against a real Postgres (throwaway database)
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
  describe('extras on a booking (migration 041)', () => {
    let catalogId = '';

    async function catalogExtra(name: string, kind: string, price: number): Promise<string> {
      const result = await admin.query<{ id: string }>(
        `INSERT INTO extra_services (organization_id, property_id, name, kind, price_cents, currency_code) VALUES ($1, $2, $3, $4, $5, 'EUR') RETURNING id`,
        [ORG, PROPERTY, name, kind, price],
      );
      return result.rows[0]?.id ?? '';
    }

    const insertExtra = (pool: Pool, booking: string, fields: { kind: string; quantity: number; unit: number; line: number; status: string; org?: string; name?: string }): Promise<unknown> =>
      pool.query(
        `INSERT INTO reservation_extras (organization_id, property_id, inventory_block_id, extra_service_id, name, kind, quantity, unit_price_cents, line_cents, currency_code, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'EUR', $10)`,
        [fields.org ?? ORG, PROPERTY, booking, catalogId, fields.name ?? 'Breakfast basket', fields.kind, fields.quantity, fields.unit, fields.line, fields.status],
      );

    beforeAll(async () => {
      catalogId = await catalogExtra('Breakfast basket', 'instant', 1800);
    });

    it('lets the app role save an instant extra at price x quantity and a request at nothing', async () => {
      const booking = await insert(app, { method: 'pay_at_hotel', status: 'pending', paid: 0 });

      await insertExtra(app, booking, { kind: 'instant', quantity: 2, unit: 1800, line: 3600, status: 'confirmed' });
      await insertExtra(app, booking, { kind: 'on_request', quantity: 1, unit: 0, line: 0, status: 'pending', name: 'Extra pillows' });

      const rows = await admin.query<{ name: string; line_cents: number; status: string }>('SELECT name, line_cents, status FROM reservation_extras WHERE inventory_block_id = $1 ORDER BY name', [booking]);
      expect(rows.rows).toEqual([
        { name: 'Breakfast basket', line_cents: 3600, status: 'confirmed' },
        { name: 'Extra pillows', line_cents: 0, status: 'pending' },
      ]);
    });

    it('refuses a line that does not match its kind, and a quantity outside 1 to 20', async () => {
      const booking = await insert(app, { method: 'pay_at_hotel', status: 'pending', paid: 0 });
      const attempt = async (fields: Parameters<typeof insertExtra>[2]): Promise<string> => {
        try {
          await insertExtra(app, booking, fields);
        } catch (error: unknown) {
          return error instanceof Error ? error.message : String(error);
        }
        return '';
      };

      expect(await attempt({ kind: 'instant', quantity: 2, unit: 1800, line: 1800, status: 'confirmed' })).toContain('reservation_extras_line_matches_kind');
      expect(await attempt({ kind: 'instant', quantity: 1, unit: 1800, line: 1800, status: 'pending' })).toContain('reservation_extras_line_matches_kind');
      expect(await attempt({ kind: 'on_request', quantity: 1, unit: 500, line: 500, status: 'pending' })).toContain('reservation_extras_line_matches_kind');
      expect(await attempt({ kind: 'instant', quantity: 0, unit: 1800, line: 0, status: 'confirmed' })).toContain('quantity');
      expect(await attempt({ kind: 'instant', quantity: 21, unit: 1800, line: 37800, status: 'confirmed' })).toContain('quantity');
    });

    it('ties an extra to the booking\'s own organization and property', async () => {
      const other = await admin.query<{ id: string }>(`INSERT INTO organizations (name) VALUES ('Other Org ${SUFFIX}') RETURNING id`);
      const otherOrg = other.rows[0]?.id ?? '';
      const booking = await insert(app, { method: 'pay_at_hotel', status: 'pending', paid: 0 });

      expect(await failure(app, `INSERT INTO reservation_extras (organization_id, property_id, inventory_block_id, name, kind, quantity, unit_price_cents, line_cents, currency_code, status)
        VALUES ($1, $2, $3, 'Cot', 'on_request', 1, 0, 0, 'EUR', 'pending')`, [otherOrg, PROPERTY, booking])).toContain('reservation_extras_');
    });

    it('lets the app role move the status only: price, quantity and name are fixed, and nothing is deleted', async () => {
      const booking = await insert(app, { method: 'pay_at_hotel', status: 'pending', paid: 0 });
      await insertExtra(app, booking, { kind: 'on_request', quantity: 1, unit: 0, line: 0, status: 'pending', name: 'Travel cot' });

      expect((await app.query(`UPDATE reservation_extras SET status = 'declined', updated_at = now() WHERE inventory_block_id = $1`, [booking])).rowCount).toBe(1);
      expect(await failure(app, `UPDATE reservation_extras SET unit_price_cents = 5000 WHERE inventory_block_id = $1`, [booking])).toContain('permission denied');
      expect(await failure(app, `UPDATE reservation_extras SET quantity = 9 WHERE inventory_block_id = $1`, [booking])).toContain('permission denied');
      expect(await failure(app, `DELETE FROM reservation_extras WHERE inventory_block_id = $1`, [booking])).toContain('permission denied');
    });

    it('stops even the owner role from changing a price or deleting a row, except in a maintenance transaction', async () => {
      const booking = await insert(admin, { method: 'pay_at_hotel', status: 'pending', paid: 0 });
      await insertExtra(admin, booking, { kind: 'instant', quantity: 1, unit: 1800, line: 1800, status: 'confirmed' });

      expect(await failure(admin, `UPDATE reservation_extras SET unit_price_cents = 1, line_cents = 1 WHERE inventory_block_id = $1`, [booking])).toContain('never change');
      expect(await failure(admin, `DELETE FROM reservation_extras WHERE inventory_block_id = $1`, [booking])).toContain('DELETE is not allowed');

      const client = await admin.connect();
      try {
        await client.query('BEGIN');
        await client.query(`SET LOCAL resort.record_maintenance = 'on'`);
        expect((await client.query(`DELETE FROM reservation_extras WHERE inventory_block_id = $1`, [booking])).rowCount).toBe(1);
        await client.query('ROLLBACK');
      } finally {
        client.release();
      }
      const kept = await admin.query<{ n: string }>('SELECT count(*) AS n FROM reservation_extras WHERE inventory_block_id = $1', [booking]);
      expect(kept.rows[0]?.n).toBe('1');
    });

    it('keeps the booking\'s copy of an extra when the property deletes it from its list', async () => {
      const gone = await catalogExtra('Seasonal fruit', 'instant', 900);
      const booking = await insert(app, { method: 'pay_at_hotel', status: 'pending', paid: 0 });
      await app.query(
        `INSERT INTO reservation_extras (organization_id, property_id, inventory_block_id, extra_service_id, name, kind, quantity, unit_price_cents, line_cents, currency_code, status)
         VALUES ($1, $2, $3, $4, 'Seasonal fruit', 'instant', 1, 900, 900, 'EUR', 'confirmed')`,
        [ORG, PROPERTY, booking, gone],
      );

      await app.query('DELETE FROM extra_services WHERE id = $1', [gone]);

      const row = await admin.query<{ extra_service_id: string | null; name: string; line_cents: number }>('SELECT extra_service_id, name, line_cents FROM reservation_extras WHERE inventory_block_id = $1', [booking]);
      expect(row.rows[0]).toEqual({ extra_service_id: null, name: 'Seasonal fruit', line_cents: 900 });
    });
  });

  describe('report view (migration 042)', () => {
    it('adds payment status and paid time to the facts-only booking view, and still no guest contact data', async () => {
      const id = await insert(app, { method: 'pay_at_hotel', status: 'pending', paid: 0 });

      const row = await admin.query<{ payment_status: string; paid_at: Date | null }>('SELECT payment_status, paid_at FROM report_bookings WHERE id = $1', [id]);
      expect(row.rows[0]).toEqual({ payment_status: 'pending', paid_at: null });
      const columns = await admin.query<{ column_name: string }>(`SELECT column_name FROM information_schema.columns WHERE table_name = 'report_bookings'`);
      const names = columns.rows.map((column) => column.column_name);
      expect(names).toEqual(expect.arrayContaining(['payment_status', 'paid_at', 'total_cents', 'paid_cents']));
      expect(names).not.toEqual(expect.arrayContaining(['booker_email']));
      expect(names).not.toContain('booker_name');
      expect(names).not.toContain('booker_phone');
      expect(names).not.toContain('guest_note');
    });
  });
});

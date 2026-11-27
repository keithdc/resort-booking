/**
 * @file apps/api/src/migrations/booking-source.integration.spec.ts
 * @shared Opt-in: proves migration 045 (booking source, paid by channel) against a real Postgres (throwaway database)
 *
 * Skipped unless DATABASE_ADMIN_URL is set (a superuser URL). The database is created, migrated, given the three roles
 * and dropped afterwards.
 *   DATABASE_ADMIN_URL=postgres://resort:resort@localhost:5433/postgres npx jest booking-source.integration
 */

import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client, Pool } from 'pg';
import { urlWithCredentials } from '../shared/database/database-urls';
import { applyPendingMigrations, poolExecutor } from '../shared/database/migration-files';
import { buildRoleStatements, roleOptionsFromEnv, type RoleSetupOptions } from '../shared/database/roles';

const adminUrl = process.env.DATABASE_ADMIN_URL?.trim() ?? '';
const suite = adminUrl === '' ? describe.skip : describe;

const SUFFIX = randomBytes(4).toString('hex');
const DATABASE = `resort_check_${SUFFIX}`;
const NAMES = { DB_OWNER_ROLE: `bks_owner_${SUFFIX}`, DB_APP_ROLE: `bks_app_${SUFFIX}`, DB_READONLY_ROLE: `bks_ro_${SUFFIX}` };
const PASSWORDS = { DB_OWNER_PASSWORD: `owner-${SUFFIX}-password`, DB_APP_PASSWORD: `app-${SUFFIX}-password`, DB_READONLY_PASSWORD: `readonly-${SUFFIX}-password` };

const ORG = '11111111-1111-1111-1111-111111111111';
const PROPERTY = '22222222-2222-2222-2222-222222222221';
const HOUSE = '33333333-3333-3333-3333-333333333331';

const userOf = (url: string): string => decodeURIComponent(new URL(url).username);
const passwordOf = (url: string): string => decodeURIComponent(new URL(url).password);

suite('booking source (real Postgres, throwaway database)', () => {
  jest.setTimeout(240_000);
  let admin: Pool;
  let app: Pool;
  let readonly: Pool;
  let staffId = '';
  let night = 0;

  async function insert(pool: Pool, fields: { source?: string; method: string | null; status?: string; paid?: number; kind?: string; staff?: boolean }): Promise<string> {
    night += 3;
    const start = new Date(Date.UTC(2099, 0, 1) + night * 86_400_000).toISOString().slice(0, 10);
    const end = new Date(Date.UTC(2099, 0, 1) + (night + 2) * 86_400_000).toISOString().slice(0, 10);
    const result = await pool.query<{ id: string }>(
      `INSERT INTO inventory_blocks (organization_id, property_id, house_id, kind, status, check_in, check_out, guest_count, payment_method, payment_status,
         booker_name, booker_email, total_cents, paid_cents, currency_code, booking_source, created_by_staff_id)
       VALUES ($1, $2, $3, $4, 'confirmed', $5::date, $6::date, 2, $7, $8, 'Ada Guest', 'ada@example.com', 96000, $9, 'EUR', COALESCE($10, 'website'), $11) RETURNING id`,
      [ORG, PROPERTY, HOUSE, fields.kind ?? 'reservation', start, end, fields.method, fields.status ?? 'paid', fields.paid ?? 96000, fields.source ?? null, fields.staff === true ? staffId : null],
    );
    return result.rows[0]?.id ?? '';
  }

  const failure = async (promise: Promise<unknown>): Promise<string> => {
    try {
      await promise;
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
    staffId = (await admin.query<{ id: string }>(`INSERT INTO staff_users (organization_id, full_name, email, password_hash, role) VALUES ($1, 'Eve Employee', 'eve@example.com', 'x:y', 'employee') RETURNING id`, [ORG])).rows[0]?.id ?? '';
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

  it('defaults a booking to the website, and accepts each of the six sources in its own group', async () => {
    const id = await insert(app, { method: 'card' });
    expect((await admin.query<{ booking_source: string }>('SELECT booking_source FROM inventory_blocks WHERE id = $1', [id])).rows[0]?.booking_source).toBe('website');
    await insert(app, { method: 'pay_at_hotel', status: 'pending', paid: 0, source: 'phone_email' });
    await insert(app, { method: 'pay_at_hotel', status: 'pending', paid: 0, source: 'walk_in' });
    for (const source of ['airbnb', 'booking_com', 'other_site']) {
      await insert(app, { method: 'paid_by_channel', source });
    }
  });

  it('refuses a source that is not one of the six', async () => {
    expect(await failure(insert(app, { method: 'card', source: 'expedia' }))).toContain('inventory_blocks_booking_source_check');
  });

  it('refuses paid_by_channel on a booking that is not from a channel, and a channel reservation that is not paid_by_channel', async () => {
    expect(await failure(insert(app, { method: 'paid_by_channel', source: 'website' }))).toContain('inventory_blocks_channel_payment_needs_channel_source');
    expect(await failure(insert(app, { method: 'paid_by_channel', source: 'phone_email' }))).toContain('inventory_blocks_channel_payment_needs_channel_source');
    expect(await failure(insert(app, { method: 'card', source: 'airbnb' }))).toContain('inventory_blocks_channel_reservation_is_paid_by_channel');
    expect(await failure(insert(app, { method: 'pay_at_hotel', status: 'pending', paid: 0, source: 'airbnb' }))).toContain('inventory_blocks_channel_reservation_is_paid_by_channel');
  });

  it('lets a calendar block imported from a channel later carry the source with no payment method', async () => {
    await insert(app, { method: null, kind: 'block', source: 'airbnb' });
  });

  it('keeps a channel booking paid, and refuses to turn it back into pending', async () => {
    const id = await insert(app, { method: 'paid_by_channel', source: 'airbnb' });
    expect(await failure(app.query(`UPDATE inventory_blocks SET payment_status = 'pending', paid_cents = 0 WHERE id = $1`, [id]))).toMatch(/pending|inventory_blocks_pending_is_unpaid/);
  });

  it('allows a correction inside a group and refuses one across the groups (the payment record would be wrong)', async () => {
    const channel = await insert(app, { method: 'paid_by_channel', source: 'airbnb' });
    await app.query(`UPDATE inventory_blocks SET booking_source = 'booking_com' WHERE id = $1`, [channel]);
    expect(await failure(app.query(`UPDATE inventory_blocks SET booking_source = 'website' WHERE id = $1`, [channel]))).toContain('inventory_blocks_channel_payment_needs_channel_source');

    const own = await insert(app, { method: 'pay_at_hotel', status: 'pending', paid: 0, source: 'phone_email' });
    await app.query(`UPDATE inventory_blocks SET booking_source = 'walk_in' WHERE id = $1`, [own]);
    expect(await failure(app.query(`UPDATE inventory_blocks SET booking_source = 'airbnb' WHERE id = $1`, [own]))).toContain('inventory_blocks_channel_reservation_is_paid_by_channel');
  });

  it('backfills a booking made by a staff member as phone_email and leaves guest checkouts as website', async () => {
    const staffMade = await insert(admin, { method: 'pay_at_hotel', status: 'pending', paid: 0, staff: true });
    const guestMade = await insert(admin, { method: 'card' });
    const migration = readFileSync(join(__dirname, '045_booking_source.sql'), 'utf8');
    const update = /UPDATE inventory_blocks SET booking_source = 'phone_email'[^;]*;/.exec(migration)?.[0] ?? '';
    expect(update).not.toBe('');

    await admin.query(update);

    const rows = await admin.query<{ id: string; booking_source: string }>('SELECT id, booking_source FROM inventory_blocks WHERE id = ANY($1::uuid[])', [[staffMade, guestMade]]);
    const bySource = Object.fromEntries(rows.rows.map((row) => [row.id, row.booking_source]));
    expect(bySource[staffMade]).toBe('phone_email');
    expect(bySource[guestMade]).toBe('website');
  });

  it('exposes the source (and still no guest detail) in the read-only report view', async () => {
    const result = await readonly.query<{ booking_source: string }>('SELECT booking_source FROM report_bookings LIMIT 1');
    expect(result.rows.length).toBeGreaterThan(0);
    expect(await failure(readonly.query('SELECT booker_email FROM report_bookings'))).toMatch(/permission denied|does not exist/);
    expect(await failure(readonly.query('SELECT booker_name FROM report_bookings'))).toMatch(/permission denied|does not exist/);
  });
});

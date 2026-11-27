/**
 * @file apps/api/src/migrations/maintenance-owner-only.integration.spec.ts
 * @shared Opt-in: proves migration 044 (the maintenance switch works only for the table owner) against a real Postgres
 *
 * Skipped unless DATABASE_ADMIN_URL is set (a superuser URL). The database is created, migrated, given the three roles and
 * dropped afterwards.
 *   DATABASE_ADMIN_URL=postgres://resort:resort@localhost:5433/postgres npx jest maintenance-owner-only.integration
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
const NAMES = { DB_OWNER_ROLE: `mnt_owner_${SUFFIX}`, DB_APP_ROLE: `mnt_app_${SUFFIX}`, DB_READONLY_ROLE: `mnt_ro_${SUFFIX}` };
const PASSWORDS = { DB_OWNER_PASSWORD: `owner-${SUFFIX}-password`, DB_APP_PASSWORD: `app-${SUFFIX}-password`, DB_READONLY_PASSWORD: `readonly-${SUFFIX}-password` };

const ORG = '11111111-1111-1111-1111-111111111111';
const PROPERTY = '22222222-2222-2222-2222-222222222221';
const HOUSE = '33333333-3333-3333-3333-333333333331';

const userOf = (url: string): string => decodeURIComponent(new URL(url).username);
const passwordOf = (url: string): string => decodeURIComponent(new URL(url).password);

suite('the maintenance switch (real Postgres, throwaway database)', () => {
  jest.setTimeout(240_000);
  let admin: Pool;
  let owner: Pool;
  let app: Pool;
  let night = 0;

  async function paidBooking(): Promise<string> {
    night += 3;
    const start = new Date(Date.UTC(2097, 0, 1) + night * 86_400_000).toISOString().slice(0, 10);
    const end = new Date(Date.UTC(2097, 0, 1) + (night + 2) * 86_400_000).toISOString().slice(0, 10);
    const result = await app.query<{ id: string }>(
      `INSERT INTO inventory_blocks (organization_id, property_id, house_id, kind, status, check_in, check_out, guest_count, payment_method, payment_status,
         booker_name, booker_email, total_cents, paid_cents, paid_at, currency_code)
       VALUES ($1, $2, $3, 'reservation', 'confirmed', $4::date, $5::date, 2, 'pay_at_hotel', 'paid', 'Ada Guest', 'ada@example.com', 96000, 96000, now(), 'EUR') RETURNING id`,
      [ORG, PROPERTY, HOUSE, start, end],
    );
    return result.rows[0]?.id ?? '';
  }

  /** Runs the statement in a transaction with the switch on, as the given pool. Returns the error message or ''. */
  async function withSwitch(pool: Pool, sql: string, params: unknown[] = []): Promise<string> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL resort.record_maintenance = 'on'");
      await client.query(sql, params);
      await client.query('COMMIT');
      return '';
    } catch (error: unknown) {
      await client.query('ROLLBACK');
      return error instanceof Error ? error.message : String(error);
    } finally {
      client.release();
    }
  }

  const REVERT = `UPDATE inventory_blocks SET payment_status = 'pending', paid_cents = 0, paid_at = NULL WHERE id = $1`;

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
    owner = new Pool({ connectionString: urlWithCredentials(adminUrl, options.ownerRole, options.ownerPassword, DATABASE), max: 2 });
    app = new Pool({ connectionString: urlWithCredentials(adminUrl, options.appRole, options.appPassword, DATABASE), max: 2 });
  });

  afterAll(async () => {
    await app.end();
    await owner.end();
    await admin.end();
    const maintenance = new Client({ connectionString: urlWithCredentials(adminUrl, userOf(adminUrl), passwordOf(adminUrl), 'postgres') });
    await maintenance.connect();
    await maintenance.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    for (const role of Object.values(NAMES)) {
      await maintenance.query(`DROP ROLE IF EXISTS ${role}`);
    }
    await maintenance.end();
  });

  it('has no guard left that reads the switch directly', async () => {
    const result = await admin.query<{ proname: string; direct: boolean; helper: boolean }>(
      `SELECT p.proname,
              position('current_setting(''resort.record_maintenance''' IN p.prosrc) > 0 AS direct,
              position('resort_maintenance_allowed(TG_RELID)' IN p.prosrc) > 0 AS helper
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.prosrc LIKE '%record_maintenance%' AND p.proname <> 'resort_maintenance_allowed'`,
    );
    expect(result.rows.length).toBeGreaterThanOrEqual(6);
    for (const row of result.rows) {
      expect({ name: row.proname, direct: row.direct, helper: row.helper }).toEqual({ name: row.proname, direct: false, helper: true });
    }
  });

  it('keeps a paid booking paid, even when the app role turns the switch on', async () => {
    const id = await paidBooking();
    expect(await withSwitch(app, REVERT, [id])).toContain('a paid booking cannot go back to pending');
    const row = await admin.query<{ payment_status: string }>('SELECT payment_status FROM inventory_blocks WHERE id = $1', [id]);
    expect(row.rows[0]?.payment_status).toBe('paid');
  });

  it('refuses the same change without the switch, from the owner too', async () => {
    const id = await paidBooking();
    const client = await owner.connect();
    try {
      await expect(client.query(REVERT, [id])).rejects.toThrow('a paid booking cannot go back to pending');
    } finally {
      client.release();
    }
  });

  it('lets the owner role use the switch for a maintenance job', async () => {
    const id = await paidBooking();
    expect(await withSwitch(owner, REVERT, [id])).toBe('');
    const row = await admin.query<{ payment_status: string }>('SELECT payment_status FROM inventory_blocks WHERE id = $1', [id]);
    expect(row.rows[0]?.payment_status).toBe('pending');
  });

  it('lets a superuser use the switch too', async () => {
    const id = await paidBooking();
    expect(await withSwitch(admin, REVERT, [id])).toBe('');
  });

  it('reports the helper as false for the app role and true for the owner when the switch is on', async () => {
    const check = async (pool: Pool): Promise<boolean> => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query("SET LOCAL resort.record_maintenance = 'on'");
        const result = await client.query<{ ok: boolean }>("SELECT resort_maintenance_allowed('audit_log'::regclass) AS ok");
        await client.query('ROLLBACK');
        return result.rows[0]?.ok === true;
      } finally {
        client.release();
      }
    };
    expect(await check(app)).toBe(false);
    expect(await check(owner)).toBe(true);
  });

  it('is false for everyone while the switch is off', async () => {
    const result = await owner.query<{ ok: boolean }>("SELECT resort_maintenance_allowed('audit_log'::regclass) AS ok");
    expect(result.rows[0]?.ok).toBe(false);
  });
});

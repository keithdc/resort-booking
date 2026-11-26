/**
 * @file apps/api/src/shared/database/database-roles.integration.spec.ts
 * @shared Opt-in: proves the three database roles against a real Postgres (a throwaway database, dropped afterwards)
 *
 * Skipped unless DATABASE_ADMIN_URL is set (a superuser URL), so the normal test run never needs a database:
 *   DATABASE_ADMIN_URL=postgres://resort:resort@localhost:5433/postgres npx jest database-roles.integration
 */

import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Client, Pool } from 'pg';
import { databaseNameOf, urlWithCredentials } from './database-urls';
import { assessRuntimeRole, roleFactsFromRow, RUNTIME_ROLE_QUERY, type RuntimeRoleRow } from './role-safety';
import { applyPendingMigrations, listMigrationFiles, pendingMigrations, poolExecutor, resolveMigrationsDir } from './migration-files';
import { runProbes, type ProbeOutcome } from './role-probes';
import { buildRoleStatements, roleOptionsFromEnv, type RoleSetupOptions } from './roles';

const adminUrl = process.env.DATABASE_ADMIN_URL?.trim() ?? '';
const suite = adminUrl === '' ? describe.skip : describe;

const SUFFIX = randomBytes(4).toString('hex');
const DATABASE = `resort_roles_it_${SUFFIX}`;
const PASSWORDS = {
  DB_OWNER_PASSWORD: `owner-${SUFFIX}-password`,
  DB_APP_PASSWORD: `app-${SUFFIX}-password`,
  DB_READONLY_PASSWORD: `readonly-${SUFFIX}-password`,
};
const NAMES = { DB_OWNER_ROLE: `rit_owner_${SUFFIX}`, DB_APP_ROLE: `rit_app_${SUFFIX}`, DB_READONLY_ROLE: `rit_ro_${SUFFIX}` };

async function inRoleSetup(options: RoleSetupOptions): Promise<void> {
  const client = new Client({ connectionString: urlWithCredentials(adminUrl, userOf(adminUrl), passwordOf(adminUrl), DATABASE) });
  await client.connect();
  try {
    await client.query('BEGIN');
    for (const statement of buildRoleStatements(options)) {
      await client.query(statement.sql);
    }
    await client.query('COMMIT');
  } catch (error: unknown) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

function userOf(url: string): string {
  return decodeURIComponent(new URL(url).username);
}
function passwordOf(url: string): string {
  return decodeURIComponent(new URL(url).password);
}

async function probesAs(role: 'app' | 'readonly', user: string, password: string): Promise<ProbeOutcome[]> {
  const client = new Client({ connectionString: urlWithCredentials(adminUrl, user, password, DATABASE) });
  await client.connect();
  try {
    return await runProbes(client, role);
  } finally {
    await client.end();
  }
}

suite('database roles (real Postgres, throwaway database)', () => {
  jest.setTimeout(180_000);
  let options: RoleSetupOptions;
  let adminPool: Pool;

  beforeAll(async () => {
    const maintenance = new Client({ connectionString: urlWithCredentials(adminUrl, userOf(adminUrl), passwordOf(adminUrl), 'postgres') });
    await maintenance.connect();
    await maintenance.query(`CREATE DATABASE ${DATABASE}`);
    await maintenance.end();

    adminPool = new Pool({ connectionString: urlWithCredentials(adminUrl, userOf(adminUrl), passwordOf(adminUrl), DATABASE), max: 2 });
    options = roleOptionsFromEnv({ ...PASSWORDS, ...NAMES }, DATABASE);
    // The migrations run first as the superuser, like a database made before the roles existed.
    await applyPendingMigrations(poolExecutor(adminPool), { appRole: options.appRole });
    await inRoleSetup(options);
  });

  afterAll(async () => {
    await adminPool.end();
    const maintenance = new Client({ connectionString: urlWithCredentials(adminUrl, userOf(adminUrl), passwordOf(adminUrl), 'postgres') });
    await maintenance.connect();
    await maintenance.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    for (const role of Object.values(NAMES)) {
      await maintenance.query(`DROP ROLE IF EXISTS ${role}`);
    }
    await maintenance.end();
  });

  it('moved the existing tables and views to the owner role', async () => {
    const wrongOwner = await adminPool.query<{ name: string }>(
      `SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relkind IN ('r', 'v') AND pg_get_userbyid(c.relowner) <> $1`,
      [options.ownerRole],
    );

    expect(wrongOwner.rows).toEqual([]);
  });

  it('leaves no role a superuser, and none able to create roles or databases', async () => {
    const result = await adminPool.query<{ rolname: string; rolsuper: boolean; rolcreaterole: boolean; rolcreatedb: boolean }>(
      'SELECT rolname, rolsuper, rolcreaterole, rolcreatedb FROM pg_roles WHERE rolname = ANY($1)',
      [[options.ownerRole, options.appRole, options.readonlyRole]],
    );

    expect(result.rows).toHaveLength(3);
    for (const row of result.rows) {
      expect([row.rolname, row.rolsuper, row.rolcreaterole, row.rolcreatedb]).toEqual([row.rolname, false, false, false]);
    }
  });

  it('lets the app role do its job and refuses everything else (including the statement timeout)', async () => {
    const outcomes = await probesAs('app', options.appRole, options.appPassword);

    expect(outcomes.filter((outcome) => !outcome.ok).map((outcome) => `${outcome.probe.name}: ${outcome.detail}`)).toEqual([]);
    expect(outcomes.length).toBeGreaterThanOrEqual(30);
  });

  it('lets the read-only role read the reports, hides personal and bank data, and refuses writes', async () => {
    const outcomes = await probesAs('readonly', options.readonlyRole, options.readonlyPassword);

    expect(outcomes.filter((outcome) => !outcome.ok).map((outcome) => `${outcome.probe.name}: ${outcome.detail}`)).toEqual([]);
  });

  it('applies the timeouts to the app role', async () => {
    const result = await adminPool.query<{ setconfig: string[] }>(
      'SELECT setconfig FROM pg_db_role_setting s JOIN pg_roles r ON r.oid = s.setrole WHERE r.rolname = $1',
      [options.appRole],
    );

    const settings = (result.rows[0]?.setconfig ?? []).join(' ');
    expect(settings).toContain('statement_timeout=15s');
    expect(settings).toContain('lock_timeout=3s');
    expect(settings).toContain('idle_in_transaction_session_timeout=20s');
  });

  it('covers a table created later by the owner without running the setup again, but not the ledger', async () => {
    const owner = new Client({ connectionString: urlWithCredentials(adminUrl, options.ownerRole, options.ownerPassword, DATABASE) });
    await owner.connect();
    await owner.query('CREATE TABLE future_table (id serial PRIMARY KEY, note text)');
    await owner.end();

    const app = new Client({ connectionString: urlWithCredentials(adminUrl, options.appRole, options.appPassword, DATABASE) });
    await app.connect();
    try {
      await app.query("INSERT INTO future_table (note) VALUES ('hello')");
      const rows = await app.query<{ note: string }>('SELECT note FROM future_table');
      expect(rows.rows).toEqual([{ note: 'hello' }]);
      await expect(app.query('DROP TABLE future_table')).rejects.toMatchObject({ code: '42501' });
    } finally {
      await app.end();
    }
  });

  it('keeps the ledger read-only for the app role even after the owner applies a migration', async () => {
    const owner = new Pool({ connectionString: urlWithCredentials(adminUrl, options.ownerRole, options.ownerPassword, DATABASE), max: 1 });
    try {
      await owner.query("INSERT INTO schema_migrations (id) VALUES ('998_probe.sql')");
      await applyPendingMigrations(poolExecutor(owner), { appRole: options.appRole });
    } finally {
      await owner.end();
    }
    const app = new Client({ connectionString: urlWithCredentials(adminUrl, options.appRole, options.appPassword, DATABASE) });
    await app.connect();
    try {
      await expect(app.query("INSERT INTO schema_migrations (id) VALUES ('997_probe.sql')")).rejects.toMatchObject({ code: '42501' });
      await expect(app.query('SELECT id FROM schema_migrations LIMIT 1')).resolves.toBeDefined();
    } finally {
      await app.end();
    }
  });

  it('can be run again: the same result, no error', async () => {
    await inRoleSetup(options);

    const outcomes = await probesAs('app', options.appRole, options.appPassword);
    expect(outcomes.filter((outcome) => !outcome.ok)).toEqual([]);
  });

  it('lets the app role find out what is pending without any DDL right', async () => {
    const app = new Pool({ connectionString: urlWithCredentials(adminUrl, options.appRole, options.appPassword, DATABASE), max: 1 });
    try {
      const pending = await pendingMigrations(poolExecutor(app));
      const shipped = await listMigrationFiles();
      expect(pending.every((file: string) => shipped.includes(file))).toBe(true);
    } finally {
      await app.end();
    }
  });

  it('passes the startup role check as the app role and fails it as the superuser (production rules)', async () => {
    async function assessAs(user: string, password: string): Promise<ReturnType<typeof assessRuntimeRole>> {
      const client = new Client({ connectionString: urlWithCredentials(adminUrl, user, password, DATABASE) });
      await client.connect();
      try {
        const result = await client.query<RuntimeRoleRow>(RUNTIME_ROLE_QUERY);
        const row = result.rows[0];
        if (row === undefined) {
          throw new Error('The role row is missing');
        }
        return assessRuntimeRole(roleFactsFromRow(row), true);
      } finally {
        await client.end();
      }
    }

    expect(await assessAs(options.appRole, options.appPassword)).toEqual({ errors: [], warnings: [] });
    expect(await assessAs(options.readonlyRole, options.readonlyPassword)).toEqual({ errors: [], warnings: [] });
    const superuser = await assessAs(userOf(adminUrl), passwordOf(adminUrl));
    expect(superuser.errors.join(' ')).toContain('superuser');
    // The owner role must never be used by the API either: it owns every table, so it could drop them.
    const owner = await assessAs(options.ownerRole, options.ownerPassword);
    expect(owner.errors.join(' ')).toContain('owns');
  });

  describe('append-only financial records (migrations 032 to 034)', () => {
    async function connectAs(user: string, password: string): Promise<Client> {
      const client = new Client({ connectionString: urlWithCredentials(adminUrl, user, password, DATABASE) });
      await client.connect();
      return client;
    }

    let seeded = 0;

    /** One organization, property, house and an OPEN hold with a payment and a pending refund, made as the owner. */
    async function seedMoney(owner: Client): Promise<{ block: string; payment: string; refund: string; org: string }> {
      const base = (
        await owner.query<{ org: string; property: string; house: string }>(
          'SELECT p.organization_id AS org, p.id AS property, h.id AS house FROM properties p JOIN houses h ON h.property_id = p.id LIMIT 1',
        )
      ).rows[0];
      if (base === undefined) {
        throw new Error('The seed data has no property and house');
      }
      const { org, property, house } = base;
      seeded += 1;
      const block = (
        await owner.query<{ id: string }>(
          "INSERT INTO inventory_blocks (organization_id, property_id, house_id, kind, status, check_in, check_out) VALUES ($1, $2, $3, 'reservation', 'confirmed', date '2031-01-01' + $4::int * 5, date '2031-01-03' + $4::int * 5) RETURNING id",
          [org, property, house, seeded],
        )
      ).rows[0]?.id ?? '';
      const payment = (
        await owner.query<{ id: string }>(
          "INSERT INTO payments (organization_id, property_id, inventory_block_id, provider, provider_ref, amount_cents, currency_code, status) VALUES ($1, $2, $3, 'mock', $4, 10000, 'EUR', 'requires_payment') RETURNING id",
          [org, property, block, `mock_pi_${randomBytes(4).toString('hex')}`],
        )
      ).rows[0]?.id ?? '';
      const refund = (
        await owner.query<{ id: string }>(
          "INSERT INTO refunds (organization_id, property_id, inventory_block_id, payment_id, provider, amount_cents, percent, currency_code, status, initiated_by) VALUES ($1, $2, $3, $4, 'mock', 5000, 50, 'EUR', 'pending', 'guest') RETURNING id",
          [org, property, block, payment],
        )
      ).rows[0]?.id ?? '';
      return { block, payment, refund, org };
    }

    it('keeps the audit log append-only for the app role and, by trigger, even for the owner', async () => {
      const owner = await connectAs(options.ownerRole, options.ownerPassword);
      const app = await connectAs(options.appRole, options.appPassword);
      try {
        await app.query("INSERT INTO audit_log (action) VALUES ('probe.one')");
        await expect(app.query("UPDATE audit_log SET action = 'probe.two'")).rejects.toMatchObject({ code: '42501' });
        await expect(app.query('DELETE FROM audit_log')).rejects.toMatchObject({ code: '42501' });
        // The owner has the privilege, so the trigger is what stops a mistake.
        await expect(owner.query("UPDATE audit_log SET action = 'probe.two'")).rejects.toMatchObject({ code: '42501', message: expect.stringContaining('append-only') });
        await expect(owner.query('DELETE FROM audit_log')).rejects.toMatchObject({ code: '42501' });
        await expect(owner.query('TRUNCATE audit_log')).rejects.toMatchObject({ code: '42501' });
        const rows = await owner.query<{ action: string }>("SELECT action FROM audit_log WHERE action = 'probe.one'");
        expect(rows.rows).toHaveLength(1);
      } finally {
        await app.end();
        await owner.end();
      }
    });

    it('lets a retention job through only with the transaction-local escape hatch, and never leaves it on', async () => {
      const owner = await connectAs(options.ownerRole, options.ownerPassword);
      try {
        await owner.query("INSERT INTO audit_log (action) VALUES ('probe.retention')");
        await owner.query('BEGIN');
        await owner.query("SET LOCAL resort.record_maintenance = 'on'");
        const deleted = await owner.query("DELETE FROM audit_log WHERE action = 'probe.retention'");
        await owner.query('COMMIT');
        expect(deleted.rowCount).toBe(1);
        await expect(owner.query("DELETE FROM audit_log WHERE action = 'probe.one'")).rejects.toMatchObject({ code: '42501' });
      } finally {
        await owner.end();
      }
    });

    it('lets the staff-account foreign key blank audit_log.staff_user_id and nothing else', async () => {
      const owner = await connectAs(options.ownerRole, options.ownerPassword);
      try {
        const { org } = await seedMoney(owner);
        const staff = (
          await owner.query<{ id: string }>(
            "INSERT INTO staff_users (organization_id, full_name, email, password_hash) VALUES ($1, 'Gone', $2, 'x') RETURNING id",
            [org, `gone-${randomBytes(3).toString('hex')}@example.com`],
          )
        ).rows[0]?.id ?? '';
        await owner.query("INSERT INTO audit_log (staff_user_id, action) VALUES ($1, 'probe.fk')", [staff]);
        await owner.query('DELETE FROM staff_users WHERE id = $1', [staff]);
        const row = await owner.query<{ staff_user_id: string | null }>("SELECT staff_user_id FROM audit_log WHERE action = 'probe.fk'");
        expect(row.rows[0]?.staff_user_id).toBeNull();
      } finally {
        await owner.end();
      }
    });

    it('refuses to rewrite what a payment is, and to delete one, for every role', async () => {
      const owner = await connectAs(options.ownerRole, options.ownerPassword);
      const app = await connectAs(options.appRole, options.appPassword);
      try {
        const { payment } = await seedMoney(owner);
        await expect(app.query('UPDATE payments SET amount_cents = 1 WHERE id = $1', [payment])).rejects.toMatchObject({ code: '42501' });
        await expect(app.query('DELETE FROM payments WHERE id = $1', [payment])).rejects.toMatchObject({ code: '42501' });
        await expect(owner.query('UPDATE payments SET amount_cents = 1 WHERE id = $1', [payment])).rejects.toMatchObject({ code: '23514' });
        await expect(owner.query("UPDATE payments SET currency_code = 'USD' WHERE id = $1", [payment])).rejects.toMatchObject({ code: '23514' });
        await expect(owner.query('DELETE FROM payments WHERE id = $1', [payment])).rejects.toMatchObject({ code: '42501' });
      } finally {
        await app.end();
        await owner.end();
      }
    });

    it('moves a payment forward as the app does, and never back from succeeded', async () => {
      const owner = await connectAs(options.ownerRole, options.ownerPassword);
      const app = await connectAs(options.appRole, options.appPassword);
      try {
        const { payment } = await seedMoney(owner);
        await app.query("UPDATE payments SET status = 'succeeded', updated_at = now() WHERE id = $1 AND status = 'requires_payment'", [payment]);
        await expect(app.query("UPDATE payments SET status = 'failed' WHERE id = $1", [payment])).rejects.toMatchObject({ code: '23514' });
        await expect(app.query("UPDATE payments SET status = 'requires_payment' WHERE id = $1", [payment])).rejects.toMatchObject({ code: '23514' });
        // A date change moves the paid money to the new booking: allowed on a succeeded payment only.
        const other = (await owner.query<{ id: string }>('SELECT id FROM inventory_blocks LIMIT 1')).rows[0]?.id ?? '';
        await app.query('UPDATE payments SET inventory_block_id = $2, updated_at = now() WHERE id = $1', [payment, other]);
      } finally {
        await app.end();
        await owner.end();
      }
    });

    it('allows a late success (failed or cancelled to succeeded) and refuses every other regression', async () => {
      const owner = await connectAs(options.ownerRole, options.ownerPassword);
      const app = await connectAs(options.appRole, options.appPassword);
      try {
        const { payment } = await seedMoney(owner);
        await app.query("UPDATE payments SET status = 'cancelled', failure_reason = 'hold_expired' WHERE id = $1", [payment]);
        await expect(app.query("UPDATE payments SET status = 'failed' WHERE id = $1", [payment])).rejects.toMatchObject({ code: '23514' });
        await expect(app.query("UPDATE payments SET status = 'requires_payment' WHERE id = $1", [payment])).rejects.toMatchObject({ code: '23514' });
        await app.query("UPDATE payments SET status = 'succeeded', failure_reason = 'late_success' WHERE id = $1", [payment]);
      } finally {
        await app.end();
        await owner.end();
      }
    });

    it('moves a refund only along pending, failed (retry) and succeeded, and freezes a succeeded one', async () => {
      const owner = await connectAs(options.ownerRole, options.ownerPassword);
      const app = await connectAs(options.appRole, options.appPassword);
      try {
        const { refund } = await seedMoney(owner);
        await app.query("UPDATE refunds SET status = 'failed', failure_reason = 'nope', updated_at = now() WHERE id = $1", [refund]);
        await app.query("UPDATE refunds SET status = 'pending', failure_reason = NULL, processing_started_at = now(), attempts = attempts + 1 WHERE id = $1", [refund]);
        await app.query("UPDATE refunds SET status = 'succeeded', provider_ref = 'mock_re_1', updated_at = now() WHERE id = $1", [refund]);
        for (const status of ['pending', 'failed']) {
          await expect(app.query('UPDATE refunds SET status = $2 WHERE id = $1', [refund, status])).rejects.toMatchObject({ code: '23514' });
        }
        await expect(app.query("UPDATE refunds SET provider_ref = 'other' WHERE id = $1", [refund])).rejects.toMatchObject({ code: '23514' });
        await expect(app.query('UPDATE refunds SET amount_cents = 1 WHERE id = $1', [refund])).rejects.toMatchObject({ code: '42501' });
        await expect(owner.query('UPDATE refunds SET amount_cents = 1 WHERE id = $1', [refund])).rejects.toMatchObject({ code: '23514' });
        await expect(app.query('DELETE FROM refunds WHERE id = $1', [refund])).rejects.toMatchObject({ code: '42501' });
        await expect(owner.query('DELETE FROM refunds WHERE id = $1', [refund])).rejects.toMatchObject({ code: '42501' });
      } finally {
        await app.end();
        await owner.end();
      }
    });

    it('lets staff mark a pending refund paid by hand (provider becomes manual) and nothing else about the provider', async () => {
      const owner = await connectAs(options.ownerRole, options.ownerPassword);
      const app = await connectAs(options.appRole, options.appPassword);
      try {
        const { refund } = await seedMoney(owner);
        await expect(app.query("UPDATE refunds SET provider = 'stripe' WHERE id = $1", [refund])).rejects.toMatchObject({ code: '23514' });
        await app.query("UPDATE refunds SET status = 'succeeded', provider = 'manual', resolution_note = 'sent', resolved_at = now(), updated_at = now() WHERE id = $1", [refund]);
      } finally {
        await app.end();
        await owner.end();
      }
    });

    it('stores webhook events once per provider event id, and lets the app change their status only', async () => {
      const app = await connectAs(options.appRole, options.appPassword);
      try {
        const insert = "INSERT INTO payment_webhook_events (provider, provider_event_id, type, payload_sha256) VALUES ('mock', 'evt_1', 'payment_intent.succeeded', repeat('a', 64))";
        await app.query(insert);
        await expect(app.query(insert)).rejects.toMatchObject({ code: '23505' });
        await app.query("UPDATE payment_webhook_events SET status = 'processed', processed_at = now(), updated_at = now() WHERE provider_event_id = 'evt_1'");
        await expect(app.query("UPDATE payment_webhook_events SET payload_sha256 = repeat('b', 64)")).rejects.toMatchObject({ code: '42501' });
        await expect(app.query('DELETE FROM payment_webhook_events')).rejects.toMatchObject({ code: '42501' });
      } finally {
        await app.end();
      }
    });

    it('applies the same narrowing again after a migration run and when the migrations are replayed', async () => {
      const owner = new Pool({ connectionString: urlWithCredentials(adminUrl, options.ownerRole, options.ownerPassword, DATABASE), max: 1 });
      try {
        await applyPendingMigrations(poolExecutor(owner), { appRole: options.appRole });
        // Replay of the guard migrations: they must be safe to run on a database that already has them.
        for (const file of ['032_financial_record_guards.sql', '033_refund_lease_and_late_payments.sql', '034_payment_webhook_events.sql']) {
          await owner.query(await readFile(join(resolveMigrationsDir(), file), 'utf8'));
        }
      } finally {
        await owner.end();
      }
      const outcomes = await probesAs('app', options.appRole, options.appPassword);
      expect(outcomes.filter((outcome) => !outcome.ok)).toEqual([]);
    });
  });

  it('names the database it ran in (sanity check of the helper)', () => {
    expect(databaseNameOf(urlWithCredentials(adminUrl, 'a', 'b', DATABASE))).toBe(DATABASE);
  });
});

/**
 * @file apps/api/src/shared/database/database-roles.integration.spec.ts
 * @shared Opt-in: proves the three database roles against a real Postgres (a throwaway database, dropped afterwards)
 *
 * Skipped unless DATABASE_ADMIN_URL is set (a superuser URL), so the normal test run never needs a database:
 *   DATABASE_ADMIN_URL=postgres://resort:resort@localhost:5433/postgres npx jest database-roles.integration
 */

import { randomBytes } from 'node:crypto';
import { Client, Pool } from 'pg';
import { databaseNameOf, urlWithCredentials } from './database-urls';
import { assessRuntimeRole, roleFactsFromRow, RUNTIME_ROLE_QUERY, type RuntimeRoleRow } from './role-safety';
import { applyPendingMigrations, listMigrationFiles, pendingMigrations, poolExecutor } from './migration-files';
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
    expect(outcomes.length).toBeGreaterThanOrEqual(14);
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

  it('names the database it ran in (sanity check of the helper)', () => {
    expect(databaseNameOf(urlWithCredentials(adminUrl, 'a', 'b', DATABASE))).toBe(DATABASE);
  });
});

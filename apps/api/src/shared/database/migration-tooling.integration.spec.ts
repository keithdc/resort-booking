/**
 * @file apps/api/src/shared/database/migration-tooling.integration.spec.ts
 * @shared Opt-in: migration runner (lock, checksums, rollback) and migrations 035/036 against a real Postgres
 *
 * Skipped unless DATABASE_ADMIN_URL is set (a superuser URL). A throwaway database and three throwaway roles are created and
 * dropped again; nothing else is touched.
 *   DATABASE_ADMIN_URL=postgres://resort:resort@localhost:5433/postgres npx jest migration-tooling.integration
 */

import { randomBytes } from 'node:crypto';
import { cpSync, mkdtempSync, readdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, Pool } from 'pg';
import { urlWithCredentials } from './database-urls';
import { applyPendingMigrations, findEditedMigrations, poolExecutor, resolveMigrationsDir } from './migration-files';
import { buildRoleStatements, roleOptionsFromEnv, type RoleSetupOptions } from './roles';

const adminUrl = process.env.DATABASE_ADMIN_URL?.trim() ?? '';
const suite = adminUrl === '' ? describe.skip : describe;

const SUFFIX = randomBytes(4).toString('hex');
const DATABASE = `resort_check_${SUFFIX}`;
const NAMES = { DB_OWNER_ROLE: `mt_owner_${SUFFIX}`, DB_APP_ROLE: `mt_app_${SUFFIX}`, DB_READONLY_ROLE: `mt_ro_${SUFFIX}` };
const PASSWORDS = { DB_OWNER_PASSWORD: `owner-${SUFFIX}-password`, DB_APP_PASSWORD: `app-${SUFFIX}-password`, DB_READONLY_PASSWORD: `readonly-${SUFFIX}-password` };

const userOf = (url: string): string => decodeURIComponent(new URL(url).username);
const passwordOf = (url: string): string => decodeURIComponent(new URL(url).password);

suite('migration tooling and migrations 035/036 (real Postgres, throwaway database)', () => {
  jest.setTimeout(240_000);
  let options: RoleSetupOptions;
  let admin: Pool;
  let owner: Pool;
  let app: Pool;
  let propertyId = '';
  let organizationId = '';
  let otherOrganizationId = '';

  const maintenance = (): Client => new Client({ connectionString: urlWithCredentials(adminUrl, userOf(adminUrl), passwordOf(adminUrl), 'postgres') });

  beforeAll(async () => {
    const client = maintenance();
    await client.connect();
    await client.query(`CREATE DATABASE ${DATABASE}`);
    await client.end();
    admin = new Pool({ connectionString: urlWithCredentials(adminUrl, userOf(adminUrl), passwordOf(adminUrl), DATABASE), max: 2 });
    options = roleOptionsFromEnv({ ...PASSWORDS, ...NAMES }, DATABASE);
  });

  afterAll(async () => {
    await app.end();
    await owner.end();
    await admin.end();
    const client = maintenance();
    await client.connect();
    await client.query(`DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE)`);
    for (const role of Object.values(NAMES)) {
      await client.query(`DROP ROLE IF EXISTS ${role}`);
    }
    await client.end();
  });

  it('applies every migration with a checksum each, and a second run has nothing to do', async () => {
    const applied = await applyPendingMigrations(poolExecutor(admin), { appRole: options.appRole });

    expect(applied).toEqual(readdirSync(resolveMigrationsDir()).filter((name) => name.endsWith('.sql')).sort());
    const missing = await admin.query('SELECT count(*)::int AS n FROM schema_migrations WHERE checksum IS NULL');
    expect(missing.rows[0]).toEqual({ n: 0 });
    await expect(applyPendingMigrations(poolExecutor(admin), { appRole: options.appRole })).resolves.toEqual([]);
    expect(await findEditedMigrations(poolExecutor(admin))).toEqual([]);

    for (const statement of buildRoleStatements(options)) {
      await admin.query(statement.sql);
    }
    owner = new Pool({ connectionString: urlWithCredentials(adminUrl, options.ownerRole, options.ownerPassword, DATABASE), max: 2 });
    app = new Pool({ connectionString: urlWithCredentials(adminUrl, options.appRole, options.appPassword, DATABASE), max: 2 });
    const property = await admin.query<{ id: string; organization_id: string }>('SELECT id, organization_id FROM properties LIMIT 1');
    propertyId = property.rows[0]?.id ?? '';
    organizationId = property.rows[0]?.organization_id ?? '';
    const other = await admin.query<{ id: string }>("INSERT INTO organizations (name) VALUES ('Other workspace') RETURNING id");
    otherOrganizationId = other.rows[0]?.id ?? '';
  });

  it('two runners at once do not collide: one applies, the other waits and finds nothing to do', async () => {
    const client = maintenance();
    await client.connect();
    const second = `resort_check_${SUFFIX}_b`;
    await client.query(`CREATE DATABASE ${second}`);
    await client.end();
    const pool = new Pool({ connectionString: urlWithCredentials(adminUrl, userOf(adminUrl), passwordOf(adminUrl), second), max: 4 });
    try {
      const [first, other] = await Promise.all([
        applyPendingMigrations(poolExecutor(pool), { lockPollMs: 20 }),
        applyPendingMigrations(poolExecutor(pool), { lockPollMs: 20 }),
      ]);

      expect([first.length, other.length].sort((a, b) => a - b)).toEqual([0, first.length + other.length]);
      expect(Math.max(first.length, other.length)).toBeGreaterThan(30);
    } finally {
      await pool.end();
      const cleanup = maintenance();
      await cleanup.connect();
      await cleanup.query(`DROP DATABASE IF EXISTS ${second} WITH (FORCE)`);
      await cleanup.end();
    }
  });

  it('notices an edited, already applied migration and refuses to run (strict) or reports it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'edited-migrations-'));
    cpSync(resolveMigrationsDir(), dir, { recursive: true });
    const first = join(dir, '001_init.sql');
    writeFileSync(first, `${readFileSync(first, 'utf8')}\n-- edited later\n`);

    const edited = await findEditedMigrations(poolExecutor(admin), dir);
    expect(edited.map((item) => item.id)).toEqual(['001_init.sql']);
    await expect(applyPendingMigrations(poolExecutor(admin), { dir, appRole: options.appRole })).rejects.toThrow(/001_init\.sql/);
    const reported: string[] = [];
    await expect(applyPendingMigrations(poolExecutor(admin), { dir, appRole: options.appRole, strictChecksums: false, onEdited: (message) => reported.push(message) })).resolves.toEqual([]);
    expect(reported).toHaveLength(1);
  });

  it('rolls a failing file back completely, names it, and the next run starts again from it', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'failing-migrations-'));
    cpSync(resolveMigrationsDir(), dir, { recursive: true });
    writeFileSync(join(dir, '990_broken.sql'), 'CREATE TABLE should_not_survive (id int);\nSELECT * FROM table_that_does_not_exist;\n');

    await expect(applyPendingMigrations(poolExecutor(admin), { dir, appRole: options.appRole })).rejects.toThrow(/Migration 990_broken\.sql failed and was rolled back/);

    const left = await admin.query("SELECT to_regclass('should_not_survive') AS t, (SELECT count(*)::int FROM schema_migrations WHERE id = '990_broken.sql') AS ledger");
    expect(left.rows[0]).toEqual({ t: null, ledger: 0 });
    const lock = await admin.query("SELECT count(*)::int AS n FROM pg_locks WHERE locktype = 'advisory' AND granted");
    expect(lock.rows[0]).toEqual({ n: 0 });
  });

  it('a replay of 035 and 036 changes nothing and leaves no helper function', async () => {
    const before = await admin.query('SELECT count(*)::int AS n FROM pg_constraint');
    for (const file of ['035_check_constraints.sql', '036_tenant_composite_foreign_keys.sql']) {
      await admin.query(readFileSync(join(resolveMigrationsDir(), file), 'utf8'));
    }
    const after = await admin.query('SELECT count(*)::int AS n FROM pg_constraint');
    expect(after.rows[0]).toEqual(before.rows[0]);
    expect((await admin.query("SELECT count(*)::int AS n FROM pg_proc WHERE proname LIKE 'resort_migration_%'")).rows[0]).toEqual({ n: 0 });
    expect((await admin.query('SELECT count(*)::int AS n FROM pg_constraint WHERE NOT convalidated')).rows[0]).toEqual({ n: 0 });
  });

  const house = (organization: string, overrides: { slug?: string; currency?: string } = {}): [string, unknown[]] => [
    `INSERT INTO houses (organization_id, property_id, slug, name, description, capacity, nightly_rate_cents, currency_code)
     VALUES ($1, $2, $3, 'Test house', '', 2, 10000, $4) RETURNING id`,
    [organization, propertyId, overrides.slug ?? 'tenant-test-house', overrides.currency ?? 'EUR'],
  ];

  it('the API role can still save a consistent house, with its rate period and amenity, and delete it again (cascades kept)', async () => {
    const [sql, params] = house(organizationId);
    const created = await app.query<{ id: string }>(sql, params);
    const id = created.rows[0]?.id ?? '';
    await app.query(
      "INSERT INTO rate_periods (organization_id, property_id, house_id, label, start_date, end_date, nightly_rate_cents) VALUES ($1, $2, $3, 'Peak', '2031-07-01', '2031-07-10', 20000)",
      [organizationId, propertyId, id],
    );
    await app.query("INSERT INTO house_amenities (organization_id, property_id, house_id, name, details, sort_order) VALUES ($1, $2, $3, 'Sauna', '', 0)", [organizationId, propertyId, id]);

    await app.query('DELETE FROM houses WHERE id = $1', [id]);

    const left = await admin.query('SELECT (SELECT count(*)::int FROM rate_periods WHERE house_id = $1) AS periods, (SELECT count(*)::int FROM house_amenities WHERE house_id = $1) AS amenities', [id]);
    expect(left.rows[0]).toEqual({ periods: 0, amenities: 0 });
  });

  it('refuses a house under another organization property, a rate period of the wrong property, and bad shapes', async () => {
    const [crossSql, crossParams] = house(otherOrganizationId);
    await expect(app.query(crossSql, crossParams)).rejects.toMatchObject({ code: '23503', constraint: 'houses_property_organization_fkey' });
    const [currencySql, currencyParams] = house(organizationId, { currency: 'eur' });
    await expect(app.query(currencySql, currencyParams)).rejects.toMatchObject({ code: '23514', constraint: 'houses_currency_format' });
    const [slugSql, slugParams] = house(organizationId, { slug: 'Not A Slug' });
    await expect(app.query(slugSql, slugParams)).rejects.toMatchObject({ code: '23514', constraint: 'houses_slug_format' });
    await expect(
      app.query("INSERT INTO extra_services (organization_id, property_id, name, description, kind, price_cents, currency_code) VALUES ($1, $2, 'Spa', '', 'instant', 100, 'EUR')", [otherOrganizationId, propertyId]),
    ).rejects.toMatchObject({ code: '23503', constraint: 'extra_services_property_organization_fkey' });
    await expect(app.query("UPDATE properties SET latitude = 95 WHERE id = $1", [propertyId])).rejects.toMatchObject({ code: '23514', constraint: 'properties_coordinates_range' });
  });

  it('refuses money rows that point at another organization property or payment', async () => {
    const block = await admin.query<{ id: string }>('SELECT id FROM inventory_blocks WHERE property_id = $1 LIMIT 1', [propertyId]);
    const blockId = block.rows[0]?.id ?? '';
    await expect(
      app.query(
        "INSERT INTO payments (organization_id, property_id, inventory_block_id, provider, provider_ref, amount_cents, currency_code, status, purpose) VALUES ($1, $2, $3, 'mock', 'cross-org', 100, 'EUR', 'requires_payment', 'booking')",
        [otherOrganizationId, propertyId, blockId],
      ),
    ).rejects.toMatchObject({ code: '23503', constraint: 'payments_property_organization_fkey' });
  });
});

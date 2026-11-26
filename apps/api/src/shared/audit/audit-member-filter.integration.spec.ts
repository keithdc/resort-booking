/**
 * @file apps/api/src/shared/audit/audit-member-filter.integration.spec.ts
 * @shared Opt-in: the audit log's "Member" filter against a real Postgres (throwaway database)
 *
 * Skipped unless DATABASE_ADMIN_URL is set (a superuser URL). The database is created, migrated, given the three roles,
 * and dropped afterwards. Proves: the filter returns only that member's rows, it works with paging, and another
 * organization's member id returns nothing (the organization filter always applies).
 *   DATABASE_ADMIN_URL=postgres://resort:resort@localhost:5433/postgres npx jest audit-member-filter.integration
 */

import { randomBytes } from 'node:crypto';
import { Client, Pool } from 'pg';
import { urlWithCredentials } from '../database/database-urls';
import { applyPendingMigrations, poolExecutor } from '../database/migration-files';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { buildRoleStatements, roleOptionsFromEnv, type RoleSetupOptions } from '../database/roles';
import { AuditRepository } from './audit.repository';

const adminUrl = process.env.DATABASE_ADMIN_URL?.trim() ?? '';
const suite = adminUrl === '' ? describe.skip : describe;

const SUFFIX = randomBytes(4).toString('hex');
const DATABASE = `resort_check_${SUFFIX}`;
const NAMES = { DB_OWNER_ROLE: `amf_owner_${SUFFIX}`, DB_APP_ROLE: `amf_app_${SUFFIX}`, DB_READONLY_ROLE: `amf_ro_${SUFFIX}` };
const PASSWORDS = { DB_OWNER_PASSWORD: `owner-${SUFFIX}-password`, DB_APP_PASSWORD: `app-${SUFFIX}-password`, DB_READONLY_PASSWORD: `readonly-${SUFFIX}-password` };

const ORG = '11111111-1111-1111-1111-111111111111';
const OTHER_ORG = '99999999-9999-9999-9999-999999999999';

const userOf = (url: string): string => decodeURIComponent(new URL(url).username);
const passwordOf = (url: string): string => decodeURIComponent(new URL(url).password);

suite('audit log member filter (real Postgres, throwaway database)', () => {
  jest.setTimeout(240_000);
  let admin: Pool;
  let app: Pool;
  let database: DatabaseService;
  let repository: AuditRepository;
  let ada = '';
  let eve = '';
  let mallory = '';

  async function staff(org: string, name: string, email: string): Promise<string> {
    const result = await admin.query<{ id: string }>(
      `INSERT INTO staff_users (organization_id, full_name, email, password_hash, role) VALUES ($1, $2, $3, 'x:y', 'employee') RETURNING id`,
      [org, name, email],
    );
    return result.rows[0]?.id ?? '';
  }

  async function log(org: string, who: string | null, action: string): Promise<void> {
    await admin.query(`INSERT INTO audit_log (organization_id, staff_user_id, action) VALUES ($1, $2, $3)`, [org, who, action]);
  }

  const page = (staffUserId: string | null, limit = 50, after: { createdAt: string; id: string } | null = null): ReturnType<AuditRepository['page']> =>
    repository.page({ organizationId: ORG, actionPrefix: null, staffUserId, from: null, to: null, after, limit });

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
    database = new DatabaseService(
      new ConfigService({ DATABASE_URL: urlWithCredentials(adminUrl, options.appRole, options.appPassword, DATABASE), NODE_ENV: 'test' }),
    );
    repository = new AuditRepository(database);
    await admin.query(`INSERT INTO organizations (id, name) VALUES ($1, 'Other workspace')`, [OTHER_ORG]);
    ada = await staff(ORG, 'Ada Admin', 'ada-amf@example.com');
    eve = await staff(ORG, 'Eve Employee', 'eve-amf@example.com');
    mallory = await staff(OTHER_ORG, 'Mallory', 'mallory-amf@example.com');
    for (let i = 0; i < 3; i += 1) {
      await log(ORG, ada, `team.test_${String(i)}`);
    }
    await log(ORG, eve, 'booking.created_by_staff');
    await log(ORG, null, 'auth.login_failed');
    await log(OTHER_ORG, mallory, 'team.other');
  });

  afterAll(async () => {
    await database.onModuleDestroy();
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

  it('returns only what that member did', async () => {
    const result = await page(ada);

    expect(result.records.map((record) => record.action).sort()).toEqual(['team.test_0', 'team.test_1', 'team.test_2']);
    expect(result.records.every((record) => record.staffUserId === ada && record.staffName === 'Ada Admin')).toBe(true);
  });

  it('returns everyone\'s rows of this organization (and none of another one) when no member is chosen', async () => {
    const result = await page(null);

    expect(result.records).toHaveLength(5);
    expect(result.records.some((record) => record.action === 'team.other')).toBe(false);
  });

  it('pages inside one member\'s rows', async () => {
    const first = await page(ada, 2);
    expect(first.records).toHaveLength(2);
    expect(first.hasMore).toBe(true);

    const second = await page(ada, 2, first.last);
    expect(second.records).toHaveLength(1);
    expect(second.hasMore).toBe(false);
    expect(second.records[0]?.staffUserId).toBe(ada);
  });

  it('returns nothing for a member of another organization, whose rows exist but must never leak', async () => {
    const result = await page(mallory);

    expect(result.records).toEqual([]);
    expect(result.hasMore).toBe(false);
  });

  it('returns nothing for an id nobody has', async () => {
    expect((await page('00000000-0000-4000-8000-000000000000')).records).toEqual([]);
  });

  it('finds the other employee\'s single row', async () => {
    expect((await page(eve)).records.map((record) => record.action)).toEqual(['booking.created_by_staff']);
  });
});

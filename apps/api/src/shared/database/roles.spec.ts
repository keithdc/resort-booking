/**
 * @file apps/api/src/shared/database/roles.spec.ts
 * @shared The role setup statements (pure: no database needed)
 */

import {
  assertIdentifier,
  buildRoleStatements,
  quoteLiteral,
  RESTRICTED_TABLES,
  restrictedTableStatements,
  roleOptionsFromEnv,
  type RoleSetupOptions,
} from './roles';

const PASSWORDS = {
  DB_OWNER_PASSWORD: 'owner-password-1234',
  DB_APP_PASSWORD: "app'password\\5678",
  DB_READONLY_PASSWORD: 'readonly-password-9012',
};

function options(overrides: Partial<RoleSetupOptions> = {}): RoleSetupOptions {
  return { ...roleOptionsFromEnv(PASSWORDS, 'resort_booking'), ...overrides };
}

function allSql(opts: RoleSetupOptions = options()): string {
  return buildRoleStatements(opts).map((statement): string => statement.sql).join(';\n');
}

describe('assertIdentifier', () => {
  it('accepts plain lower-case names', () => {
    expect(assertIdentifier('resort_app', 'x')).toBe('resort_app');
    expect(assertIdentifier('_a1', 'x')).toBe('_a1');
  });

  it.each(['Resort', 'resort-app', 'resort app', '', '1abc', 'a"b', "a';drop", 'a'.repeat(64)])('refuses %p', (bad) => {
    expect(() => assertIdentifier(bad, 'The role')).toThrow(/The role must be/);
  });
});

describe('quoteLiteral', () => {
  it('quotes and doubles single quotes', () => {
    expect(quoteLiteral('plain')).toBe("'plain'");
    expect(quoteLiteral("it's")).toBe("'it''s'");
  });

  it('uses the escape-string form for backslashes so the result does not depend on server settings', () => {
    expect(quoteLiteral('a\\b')).toBe("E'a\\\\b'");
    expect(quoteLiteral("a\\'b")).toBe("E'a\\\\''b'");
  });

  it('refuses a NUL character', () => {
    expect(() => quoteLiteral('a\u0000b')).toThrow(/NUL/);
  });
});

describe('roleOptionsFromEnv', () => {
  it('defaults the role names and reads the passwords', () => {
    const opts = options();

    expect([opts.ownerRole, opts.appRole, opts.readonlyRole]).toEqual(['resort_owner', 'resort_app', 'resort_readonly']);
    expect(opts.appStatementTimeout).toBe('15s');
    expect(opts.appLockTimeout).toBe('3s');
    expect(opts.appIdleInTransactionTimeout).toBe('20s');
  });

  it('takes custom role names', () => {
    const opts = roleOptionsFromEnv({ ...PASSWORDS, DB_APP_ROLE: 'api_rw' }, 'resort_booking');

    expect(opts.appRole).toBe('api_rw');
  });

  it('requires every password, long enough, and not the role name', () => {
    expect(() => roleOptionsFromEnv({ ...PASSWORDS, DB_APP_PASSWORD: undefined }, 'db')).toThrow(/DB_APP_PASSWORD is required/);
    expect(() => roleOptionsFromEnv({ ...PASSWORDS, DB_OWNER_PASSWORD: 'short' }, 'db')).toThrow(/at least 12/);
    expect(() => roleOptionsFromEnv({ ...PASSWORDS, DB_READONLY_ROLE: 'readonly_password_x', DB_READONLY_PASSWORD: 'readonly_password_x' }, 'db')).toThrow(/must not be the role name/);
  });

  it('refuses two roles with the same name and unsafe names', () => {
    expect(() => roleOptionsFromEnv({ ...PASSWORDS, DB_APP_ROLE: 'resort_owner' }, 'db')).toThrow(/three different names/);
    expect(() => roleOptionsFromEnv({ ...PASSWORDS, DB_APP_ROLE: 'x"; DROP' }, 'db')).toThrow(/DB_APP_ROLE must be/);
    expect(() => roleOptionsFromEnv(PASSWORDS, 'bad-name')).toThrow(/database name must be/);
  });
});

describe('buildRoleStatements', () => {
  it('creates each role only if it is missing, then alters it to the wanted shape (idempotent)', () => {
    const sql = allSql();

    for (const role of ['resort_owner', 'resort_app', 'resort_readonly']) {
      expect(sql).toContain(`IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE "${role}" LOGIN`);
      expect(sql).toContain(`ALTER ROLE "${role}" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD`);
    }
  });

  it('never prints a password, but puts the real one in the statement that sets it', () => {
    const statements = buildRoleStatements(options());
    const logged = statements.map((statement): string => statement.log).join('\n');
    const sql = statements.map((statement): string => statement.sql).join('\n');

    expect(logged).not.toContain('owner-password-1234');
    expect(logged).not.toContain('readonly-password-9012');
    expect(logged).not.toContain('password');
    expect(logged).toContain("PASSWORD '***'");
    expect(sql).toContain("PASSWORD 'owner-password-1234'");
    expect(sql).toContain("PASSWORD E'app''password\\\\5678'");
  });

  it('keeps every password out of the statements that carry no password', () => {
    const noPassword = buildRoleStatements(options()).filter((statement): boolean => !statement.sql.includes('PASSWORD'));

    expect(noPassword.length).toBeGreaterThan(20);
    for (const statement of noPassword) {
      expect(statement.sql).toBe(statement.log);
    }
  });

  it('locks the database and schema down to the three roles', () => {
    const sql = allSql();

    expect(sql).toContain('REVOKE ALL ON DATABASE "resort_booking" FROM PUBLIC');
    expect(sql).toContain('GRANT CONNECT ON DATABASE "resort_booking" TO "resort_owner", "resort_app", "resort_readonly"');
    expect(sql).toContain('ALTER SCHEMA public OWNER TO "resort_owner"');
    expect(sql).toContain('REVOKE ALL ON SCHEMA public FROM PUBLIC');
    expect(sql).toContain('GRANT USAGE ON SCHEMA public TO "resort_app", "resort_readonly"');
    expect(sql).not.toMatch(/GRANT (ALL|CREATE)[^;]*ON SCHEMA public TO "resort_app"/);
  });

  it('gives the app role rows and sequences, never DDL, TRUNCATE or superuser rights', () => {
    const sql = allSql();

    expect(sql).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "resort_app"');
    expect(sql).toContain('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "resort_app"');
    expect(sql).not.toMatch(/GRANT[^;]*TRUNCATE[^;]*TO "resort_app"/);
    expect(sql).not.toMatch(/GRANT[^;]*(ALL PRIVILEGES|CREATE)[^;]*TO "resort_app"/);
    expect(sql).not.toMatch(/WITH (LOGIN )?SUPERUSER/);
    expect(sql).not.toMatch(/[^O]CREATEDB|[^O]CREATEROLE|[^O]REPLICATION/);
  });

  it('makes the audit log, payments, refunds and history append-only for the app role, after the blanket grant', () => {
    const statements = buildRoleStatements(options()).map((statement): string => statement.sql);
    const blanket = statements.indexOf('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "resort_app"');
    const audit = statements.findIndex((sql): boolean => sql.includes('public.audit_log'));
    const sql = statements.join(';\n');

    expect(audit).toBeGreaterThan(blanket);
    expect(sql).toContain('REVOKE ALL ON public.audit_log FROM "resort_app"');
    expect(sql).toContain('GRANT SELECT, INSERT ON public.audit_log TO "resort_app"');
    expect(sql).not.toMatch(/GRANT UPDATE \([^)]*\) ON public\.audit_log/);
    expect(sql).not.toMatch(/GRANT[^;]*DELETE[^;]*ON public\.(audit_log|payments|refunds|booking_changes|payment_webhook_events)/);
  });

  it('limits UPDATE on payments and refunds to the settlement columns, never amount or currency', () => {
    const sql = allSql();
    const payments = /GRANT UPDATE \(([^)]*)\) ON public\.payments TO "resort_app"/.exec(sql)?.[1] ?? '';
    const refunds = /GRANT UPDATE \(([^)]*)\) ON public\.refunds TO "resort_app"/.exec(sql)?.[1] ?? '';

    expect(payments).toContain('"status"');
    expect(refunds).toContain('"processing_started_at"');
    for (const forbidden of ['amount_cents', 'currency_code', 'provider_ref', 'organization_id']) {
      expect(payments.includes(forbidden) && forbidden !== 'provider_ref' ? forbidden : '').toBe('');
      expect(refunds).not.toContain(forbidden === 'provider_ref' ? 'never' : forbidden);
    }
    expect(payments).not.toContain('provider_ref');
  });

  it('skips a table that does not exist and one the connected role cannot change', () => {
    const statements = restrictedTableStatements('resort_app');

    expect(statements).toHaveLength(RESTRICTED_TABLES.length);
    for (const statement of statements) {
      expect(statement).toContain("to_regclass('public.");
      expect(statement).toContain("pg_has_role(current_user");
      expect(statement).toContain("rolname = 'resort_app'");
    }
  });

  it('refuses an unsafe role name in the restricted statements', () => {
    expect(() => restrictedTableStatements('x"; DROP')).toThrow(/must be lower-case/);
  });

  it('takes write rights on the migration ledger away from the app role', () => {
    const sql = allSql();

    expect(sql).toContain('REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.schema_migrations FROM "resort_app"');
  });

  it('covers tables made by future migrations with default privileges for the owner', () => {
    const sql = allSql();

    expect(sql).toContain('ALTER DEFAULT PRIVILEGES FOR ROLE "resort_owner" IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "resort_app"');
    expect(sql).toContain('ALTER DEFAULT PRIVILEGES FOR ROLE "resort_owner" IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO "resort_app"');
  });

  it('resets privileges before granting, so running it again removes anything granted by hand', () => {
    const statements = buildRoleStatements(options()).map((statement): string => statement.sql);
    const reset = statements.indexOf('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM "resort_app", "resort_readonly"');
    const grant = statements.indexOf('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "resort_app"');

    expect(reset).toBeGreaterThan(-1);
    expect(grant).toBeGreaterThan(reset);
  });

  it('moves existing tables, views and sequences to the owner, skipping extension members and column-owned sequences', () => {
    const sql = allSql();

    expect(sql).toContain("pg_get_userbyid(c.relowner) <> 'resort_owner'");
    expect(sql).toContain("d.deptype = 'e'");
    expect(sql).toContain("d.deptype IN ('a', 'e')");
    expect(sql).toContain('OWNER TO "resort_owner"');
  });

  it('gives the read-only role only the report views and public catalogue tables', () => {
    const sql = allSql();

    expect(sql).toContain("viewname LIKE 'report\\_%'");
    expect(sql).toContain("'properties', 'houses', 'cancellation_tiers', 'rate_periods'");
    expect(sql).not.toMatch(/GRANT[^;]*(inventory_blocks|organizations|staff_users|payments|refunds)[^;]*"resort_readonly"/);
  });

  it('sets the timeouts that stop a slow query or a forgotten transaction from stalling bookings', () => {
    const sql = allSql();

    expect(sql).toContain(`ALTER ROLE "resort_app" SET statement_timeout = '15s'`);
    expect(sql).toContain(`ALTER ROLE "resort_app" SET lock_timeout = '3s'`);
    expect(sql).toContain(`ALTER ROLE "resort_app" SET idle_in_transaction_session_timeout = '20s'`);
    expect(sql).toContain(`ALTER ROLE "resort_readonly" SET statement_timeout = '30s'`);
    expect(sql).toContain('ALTER ROLE "resort_app" SET search_path = public');
    expect(sql).toContain('ALTER ROLE "resort_app" CONNECTION LIMIT 50');
  });

  it('refuses a malformed timeout and an unsafe name instead of putting it in SQL', () => {
    expect(() => buildRoleStatements(options({ appStatementTimeout: "15s'; DROP" }))).toThrow(/not a timeout/);
    expect(() => buildRoleStatements(options({ appRole: 'x"y' }))).toThrow(/must be lower-case/);
  });

  it('uses the names it was given everywhere', () => {
    const sql = allSql(options({ appRole: 'api_rw', ownerRole: 'schema_owner', readonlyRole: 'bi_ro' }));

    expect(sql).toContain('TO "api_rw"');
    expect(sql).toContain('OWNER TO "schema_owner"');
    expect(sql).not.toContain('resort_app');
    expect(sql).not.toContain('resort_owner');
  });
});

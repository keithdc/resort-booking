/**
 * @file apps/api/src/shared/database/roles.ts
 * @shared The three database roles (owner, app, read-only) as an idempotent list of SQL statements
 * @dependencies none: pure, so the statements can be tested without a database
 */

export const DEFAULT_OWNER_ROLE = 'resort_owner';
export const DEFAULT_APP_ROLE = 'resort_app';
export const DEFAULT_READONLY_ROLE = 'resort_readonly';

/** Lower-case letters, digits and underscores, at most 63 characters (Postgres' limit). Safe to put inside quotes. */
const IDENTIFIER_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;
const TIMEOUT_PATTERN = /^\d{1,6}(ms|s|min)$/;
const MIN_PASSWORD_LENGTH = 12;

/** Tables the read-only role may read as they are: public catalogue data, no guest or bank details. */
const READONLY_BASE_TABLES: readonly string[] = ['properties', 'houses', 'cancellation_tiers', 'rate_periods'];

export interface RoleSetupOptions {
  /** The database the roles are set up in (GRANT CONNECT is per database). */
  database: string;
  ownerRole: string;
  appRole: string;
  readonlyRole: string;
  ownerPassword: string;
  appPassword: string;
  readonlyPassword: string;
  appStatementTimeout: string;
  appLockTimeout: string;
  appIdleInTransactionTimeout: string;
  readonlyStatementTimeout: string;
  ownerLockTimeout: string;
  appConnectionLimit: number;
  readonlyConnectionLimit: number;
}

/** One statement to run, and the text that is safe to print (passwords hidden). */
export interface RoleStatement {
  sql: string;
  log: string;
}

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Returns the name unchanged when it is a plain lower-case identifier, otherwise throws. Names are put inside double
 * quotes and string literals, so nothing else is allowed through.
 */
export function assertIdentifier(value: string, what: string): string {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new Error(`${what} must be lower-case letters, digits and underscores (max 63): got "${value.slice(0, 70)}".`);
  }
  return value;
}

/**
 * A SQL string literal. Single quotes are doubled; a value with a backslash uses the escape-string form so the result
 * is the same whatever `standard_conforming_strings` says. A NUL byte can never be stored, so it is refused.
 */
export function quoteLiteral(value: string): string {
  if (value.includes('\u0000')) {
    throw new Error('A value cannot contain a NUL character.');
  }
  const doubled = value.replace(/'/g, "''");
  return value.includes('\\') ? `E'${doubled.replace(/\\/g, '\\\\')}'` : `'${doubled}'`;
}

/**
 * Reads the role settings from the environment. Passwords are required (no default is ever safe) and must be at
 * least 12 characters and not the role name. Names default to resort_owner, resort_app and resort_readonly.
 */
export function roleOptionsFromEnv(env: Env, database: string): RoleSetupOptions {
  const ownerRole = assertIdentifier(env.DB_OWNER_ROLE?.trim() || DEFAULT_OWNER_ROLE, 'DB_OWNER_ROLE');
  const appRole = assertIdentifier(env.DB_APP_ROLE?.trim() || DEFAULT_APP_ROLE, 'DB_APP_ROLE');
  const readonlyRole = assertIdentifier(env.DB_READONLY_ROLE?.trim() || DEFAULT_READONLY_ROLE, 'DB_READONLY_ROLE');
  if (new Set([ownerRole, appRole, readonlyRole]).size !== 3) {
    throw new Error('DB_OWNER_ROLE, DB_APP_ROLE and DB_READONLY_ROLE must be three different names.');
  }
  const password = (name: string, role: string): string => {
    const value = env[name] ?? '';
    if (value.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`${name} is required and must be at least ${String(MIN_PASSWORD_LENGTH)} characters (try: openssl rand -base64 24).`);
    }
    if (value === role) {
      throw new Error(`${name} must not be the role name.`);
    }
    return value;
  };
  return {
    database: assertIdentifier(database, 'The database name'),
    ownerRole,
    appRole,
    readonlyRole,
    ownerPassword: password('DB_OWNER_PASSWORD', ownerRole),
    appPassword: password('DB_APP_PASSWORD', appRole),
    readonlyPassword: password('DB_READONLY_PASSWORD', readonlyRole),
    appStatementTimeout: '15s',
    appLockTimeout: '3s',
    appIdleInTransactionTimeout: '20s',
    readonlyStatementTimeout: '30s',
    ownerLockTimeout: '30s',
    appConnectionLimit: 50,
    readonlyConnectionLimit: 5,
  };
}

/** A table whose runtime rights are narrower than the blanket "read and write rows". */
export interface RestrictedTable {
  table: string;
  /** Columns the app role may UPDATE. Empty: no UPDATE at all. */
  updatableColumns: readonly string[];
}

/**
 * Tables the runtime role may only INSERT into and read, plus a short list of columns it may still UPDATE (docs/13 R2-05).
 * Nothing here is ever DELETEd by the API. The triggers of migration 032 enforce the same rules for any other role.
 * `payments.inventory_block_id` stays updatable because a date change moves the paid money to the new booking.
 */
export const RESTRICTED_TABLES: readonly RestrictedTable[] = [
  { table: 'audit_log', updatableColumns: [] },
  { table: 'booking_changes', updatableColumns: [] },
  { table: 'payments', updatableColumns: ['status', 'failure_reason', 'inventory_block_id', 'updated_at'] },
  {
    table: 'refunds',
    updatableColumns: [
      'status',
      'provider',
      'provider_ref',
      'failure_reason',
      'resolution_note',
      'resolved_by_staff_id',
      'resolved_at',
      'updated_at',
      'processing_started_at',
      'attempts',
      'key_generation',
    ],
  },
  { table: 'payment_webhook_events', updatableColumns: ['status', 'attempts', 'error', 'updated_at', 'processed_at'] },
];

/**
 * The statements that give the app role its narrow rights on RESTRICTED_TABLES: everything is taken away first, then
 * SELECT and INSERT (and UPDATE of named columns) are granted. A table that does not exist yet is skipped, and so is
 * one the connected role may not change, so the statements are safe to run after any migration and again later.
 */
export function restrictedTableStatements(appRole: string): string[] {
  const app = assertIdentifier(appRole, 'The app role');
  return RESTRICTED_TABLES.map((entry: RestrictedTable): string => {
    const table = assertIdentifier(entry.table, 'The table name');
    const columns = entry.updatableColumns.map((column: string): string => `"${assertIdentifier(column, 'The column name')}"`);
    const update = columns.length === 0 ? '' : `GRANT UPDATE (${columns.join(', ')}) ON public.${table} TO "${app}";`;
    return `
      DO $$
      BEGIN
        IF to_regclass('public.${table}') IS NOT NULL
           AND pg_has_role(current_user, (SELECT relowner FROM pg_class WHERE oid = to_regclass('public.${table}')), 'MEMBER')
           AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${app}') THEN
          REVOKE ALL ON public.${table} FROM "${app}";
          GRANT SELECT, INSERT ON public.${table} TO "${app}";
          ${update}
        END IF;
      END
      $$
    `.replace(/\s+/g, ' ').trim();
  });
}

/**
 * Every statement that sets the roles up, in order. Safe to run again: roles are created only if missing and then
 * altered to the wanted shape, privileges are reset before they are granted, and ownership moves only where it differs.
 * Run it as a superuser (or the current owner) after the migrations, and again after any migration that adds tables or
 * `report_` views.
 */
export function buildRoleStatements(options: RoleSetupOptions): RoleStatement[] {
  const owner = assertIdentifier(options.ownerRole, 'The owner role');
  const app = assertIdentifier(options.appRole, 'The app role');
  const readonly = assertIdentifier(options.readonlyRole, 'The read-only role');
  const db = assertIdentifier(options.database, 'The database name');
  const timeouts = [
    options.appStatementTimeout,
    options.appLockTimeout,
    options.appIdleInTransactionTimeout,
    options.readonlyStatementTimeout,
    options.ownerLockTimeout,
  ];
  for (const timeout of timeouts) {
    if (!TIMEOUT_PATTERN.test(timeout)) {
      throw new Error(`"${timeout}" is not a timeout like 15s.`);
    }
  }
  const statements: RoleStatement[] = [];
  const plain = (sql: string): void => {
    const clean = sql.replace(/\s+/g, ' ').trim();
    statements.push({ sql: clean, log: clean });
  };
  const withPassword = (role: string, password: string): void => {
    const shape = 'LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS';
    plain(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN CREATE ROLE "${role}" LOGIN; END IF; END $$`);
    statements.push({
      sql: `ALTER ROLE "${role}" WITH ${shape} PASSWORD ${quoteLiteral(password)}`,
      log: `ALTER ROLE "${role}" WITH ${shape} PASSWORD '***'`,
    });
  };

  // 1. The roles: none of them may be a superuser, create roles or databases, or bypass row-level security.
  withPassword(owner, options.ownerPassword);
  withPassword(app, options.appPassword);
  withPassword(readonly, options.readonlyPassword);
  plain(`ALTER ROLE "${app}" CONNECTION LIMIT ${String(Math.trunc(options.appConnectionLimit))}`);
  plain(`ALTER ROLE "${readonly}" CONNECTION LIMIT ${String(Math.trunc(options.readonlyConnectionLimit))}`);

  // 2. The database: nobody connects by default; only these three roles.
  plain(`REVOKE ALL ON DATABASE "${db}" FROM PUBLIC`);
  plain(`GRANT CONNECT ON DATABASE "${db}" TO "${owner}", "${app}", "${readonly}"`);
  plain(`GRANT CREATE ON DATABASE "${db}" TO "${owner}"`);

  // 3. The schema belongs to the owner. Nobody else can create objects in it.
  plain(`ALTER SCHEMA public OWNER TO "${owner}"`);
  plain('REVOKE ALL ON SCHEMA public FROM PUBLIC');
  plain(`REVOKE ALL ON SCHEMA public FROM "${app}", "${readonly}"`);
  plain(`GRANT USAGE ON SCHEMA public TO "${app}", "${readonly}"`);
  plain(`GRANT ALL ON SCHEMA public TO "${owner}"`);

  // 4. Move what exists today (a superuser owns it in a database made before the roles) to the owner role. Objects that
  // belong to an extension, and sequences tied to a table column (they follow the table), are left alone.
  plain(`
    DO $$
    DECLARE item record;
    BEGIN
      FOR item IN
        SELECT c.relname, c.relkind
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v', 'm') AND pg_get_userbyid(c.relowner) <> '${owner}'
          AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')
      LOOP
        EXECUTE format('ALTER %s public.%I OWNER TO "${owner}"',
          CASE item.relkind WHEN 'v' THEN 'VIEW' WHEN 'm' THEN 'MATERIALIZED VIEW' ELSE 'TABLE' END, item.relname);
      END LOOP;
      FOR item IN
        SELECT c.relname
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'S' AND pg_get_userbyid(c.relowner) <> '${owner}'
          AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype IN ('a', 'e'))
      LOOP
        EXECUTE format('ALTER SEQUENCE public.%I OWNER TO "${owner}"', item.relname);
      END LOOP;
      FOR item IN
        SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND pg_get_userbyid(p.proowner) <> '${owner}' AND p.prokind IN ('f', 'p')
          AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
      LOOP
        EXECUTE format('ALTER ROUTINE public.%I(%s) OWNER TO "${owner}"', item.proname, item.args);
      END LOOP;
    END
    $$
  `);

  // 5. What the app role may do: read and write rows, use sequences. No DDL, no TRUNCATE. Privileges are reset first, so
  // running this again also takes away anything granted by hand.
  plain(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM "${app}", "${readonly}"`);
  plain(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM "${app}", "${readonly}"`);
  plain(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${app}"`);
  plain(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${app}"`);
  // The migration ledger: readable (the stale-build check) but never writable by the app.
  plain(`
    DO $$
    BEGIN
      IF to_regclass('public.schema_migrations') IS NOT NULL THEN
        REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.schema_migrations FROM "${app}";
      END IF;
    END
    $$
  `);
  // The audit log, the money tables and their history are append-only for the app: INSERT and read, UPDATE of a few
  // columns, never DELETE (docs/13 R2-05). Done after the blanket grant so it wins.
  for (const sql of restrictedTableStatements(app)) {
    plain(sql);
  }
  // Tables created by FUTURE migrations (run as the owner) are covered without another run of this script.
  plain(`ALTER DEFAULT PRIVILEGES FOR ROLE "${owner}" IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${app}"`);
  plain(`ALTER DEFAULT PRIVILEGES FOR ROLE "${owner}" IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO "${app}"`);

  // 6. What the read-only role may do: read the report_ views (booking and revenue facts, no personal or bank data)
  // and a few catalogue tables. It never gets a right on inventory_blocks, organizations, staff, payments or refunds.
  plain(`
    DO $$
    DECLARE item record;
    BEGIN
      FOR item IN SELECT viewname FROM pg_views WHERE schemaname = 'public' AND viewname LIKE 'report\\_%'
      LOOP
        EXECUTE format('GRANT SELECT ON public.%I TO "${readonly}"', item.viewname);
      END LOOP;
      FOR item IN SELECT unnest(ARRAY[${READONLY_BASE_TABLES.map((table: string): string => `'${table}'`).join(', ')}]) AS tablename
      LOOP
        IF to_regclass('public.' || item.tablename) IS NOT NULL THEN
          EXECUTE format('GRANT SELECT ON public.%I TO "${readonly}"', item.tablename);
        END IF;
      END LOOP;
    END
    $$
  `);

  // 7. Limits that stop a slow query or a forgotten transaction from holding locks and stalling bookings.
  plain(`ALTER ROLE "${app}" SET statement_timeout = '${options.appStatementTimeout}'`);
  plain(`ALTER ROLE "${app}" SET lock_timeout = '${options.appLockTimeout}'`);
  plain(`ALTER ROLE "${app}" SET idle_in_transaction_session_timeout = '${options.appIdleInTransactionTimeout}'`);
  plain(`ALTER ROLE "${app}" SET search_path = public`);
  plain(`ALTER ROLE "${readonly}" SET statement_timeout = '${options.readonlyStatementTimeout}'`);
  plain(`ALTER ROLE "${readonly}" SET search_path = public`);
  plain(`ALTER ROLE "${owner}" SET lock_timeout = '${options.ownerLockTimeout}'`);

  return statements;
}

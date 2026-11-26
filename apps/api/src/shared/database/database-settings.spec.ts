/**
 * @file apps/api/src/shared/database/database-settings.spec.ts
 * @shared Database settings: two connections, pool, TLS
 */

import {
  APPLICATION_NAME,
  buildPoolConfig,
  isLocalDatabaseHost,
  readDatabaseSettings,
  resolveMigrationTarget,
  usesTls,
} from './database-settings';

const APP = 'postgres://resort_app:secret@localhost:5433/resort_booking';
const OWNER = 'postgres://resort_owner:other@localhost:5433/resort_booking';

describe('readDatabaseSettings', () => {
  it('uses sensible pool defaults', () => {
    const settings = readDatabaseSettings({ DATABASE_URL: APP });

    expect(settings).toMatchObject({ runtimeUrl: APP, migrationUrl: null, poolMax: 10, connectionTimeoutMs: 5000, idleTimeoutMs: 30000, tls: 'off' });
  });

  it('reads the pool settings and ignores bad values instead of switching a limit off', () => {
    expect(readDatabaseSettings({ DATABASE_URL: APP, DATABASE_POOL_MAX: '25' }).poolMax).toBe(25);
    for (const bad of ['0', '-3', 'many', '1000', '2.5', '']) {
      expect(readDatabaseSettings({ DATABASE_URL: APP, DATABASE_POOL_MAX: bad }).poolMax).toBe(10);
    }
    expect(readDatabaseSettings({ DATABASE_URL: APP, DATABASE_CONNECTION_TIMEOUT_MS: '1' }).connectionTimeoutMs).toBe(5000);
  });

  it('runs migrations at start by default only on an explicit development or test run', () => {
    expect(readDatabaseSettings({ DATABASE_URL: APP, NODE_ENV: 'development' }).runMigrationsOnStart).toBe(true);
    expect(readDatabaseSettings({ DATABASE_URL: APP, NODE_ENV: 'test' }).runMigrationsOnStart).toBe(true);
    // An unset or unknown NODE_ENV is production-like: no automatic migrations.
    expect(readDatabaseSettings({ DATABASE_URL: APP }).runMigrationsOnStart).toBe(false);
    expect(readDatabaseSettings({ DATABASE_URL: APP, NODE_ENV: 'staging' }).runMigrationsOnStart).toBe(false);
    expect(readDatabaseSettings({ DATABASE_URL: APP, NODE_ENV: 'production' }).runMigrationsOnStart).toBe(false);
  });

  it('lets RUN_MIGRATIONS_ON_START override the default either way, and ignores nonsense', () => {
    expect(readDatabaseSettings({ DATABASE_URL: APP, NODE_ENV: 'production', RUN_MIGRATIONS_ON_START: 'true' }).runMigrationsOnStart).toBe(true);
    expect(readDatabaseSettings({ DATABASE_URL: APP, NODE_ENV: 'development', RUN_MIGRATIONS_ON_START: 'FALSE' }).runMigrationsOnStart).toBe(false);
    expect(readDatabaseSettings({ DATABASE_URL: APP, NODE_ENV: 'production', RUN_MIGRATIONS_ON_START: 'yes' }).runMigrationsOnStart).toBe(false);
  });

  it('reads the TLS toggle', () => {
    expect(readDatabaseSettings({ DATABASE_URL: APP, DATABASE_SSL: 'true' }).tls).toBe('require');
    expect(readDatabaseSettings({ DATABASE_URL: APP, DATABASE_SSL: 'no-verify' }).tls).toBe('no-verify');
    expect(readDatabaseSettings({ DATABASE_URL: APP, DATABASE_SSL: 'false' }).tls).toBe('off');
    expect(readDatabaseSettings({ DATABASE_URL: `${APP}?sslmode=require` }).tls).toBe('require');
  });
});

describe('resolveMigrationTarget', () => {
  it('uses the owner URL when it is set', () => {
    const target = resolveMigrationTarget(readDatabaseSettings({ DATABASE_URL: APP, MIGRATION_DATABASE_URL: OWNER }));

    expect(target).toEqual({ url: OWNER, separate: true });
  });

  it('falls back to the runtime URL when it is missing or blank (the single-URL development setup)', () => {
    expect(resolveMigrationTarget(readDatabaseSettings({ DATABASE_URL: APP }))).toEqual({ url: APP, separate: false });
    expect(resolveMigrationTarget(readDatabaseSettings({ DATABASE_URL: APP, MIGRATION_DATABASE_URL: '  ' }))).toEqual({ url: APP, separate: false });
  });
});

describe('buildPoolConfig', () => {
  it('sets the pool size, timeouts and the name that shows in pg_stat_activity', () => {
    const settings = readDatabaseSettings({ DATABASE_URL: APP, DATABASE_POOL_MAX: '12' });

    expect(buildPoolConfig(APP, settings)).toEqual({
      connectionString: APP,
      max: 12,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      application_name: APPLICATION_NAME,
    });
    expect(APPLICATION_NAME).toBe('resort-api');
  });

  it('gives the short-lived migration pool one connection', () => {
    expect(buildPoolConfig(OWNER, readDatabaseSettings({ DATABASE_URL: APP }), 1).max).toBe(1);
  });

  it('adds TLS only when asked, verifying the certificate unless told not to', () => {
    expect(buildPoolConfig(APP, readDatabaseSettings({ DATABASE_URL: APP })).ssl).toBeUndefined();
    expect(buildPoolConfig(APP, readDatabaseSettings({ DATABASE_URL: APP, DATABASE_SSL: 'true' })).ssl).toEqual({ rejectUnauthorized: true });
    expect(buildPoolConfig(APP, readDatabaseSettings({ DATABASE_URL: APP, DATABASE_SSL: 'no-verify' })).ssl).toEqual({ rejectUnauthorized: false });
  });
});

describe('isLocalDatabaseHost and usesTls', () => {
  it.each([
    ['postgres://u:p@localhost:5433/db', true],
    ['postgres://u:p@127.0.0.1/db', true],
    ['postgres://u:p@[::1]:5432/db', true],
    ['postgres://u:p@db.internal:5432/db', false],
    ['postgres://u:p@203.0.113.9/db', false],
  ])('%s is local: %s', (url, local) => {
    expect(isLocalDatabaseHost(url)).toBe(local);
  });

  it('treats an unreadable URL as local rather than guessing a remote host', () => {
    expect(isLocalDatabaseHost('not a url')).toBe(true);
  });

  it('sees TLS from the toggle or from sslmode in the URL', () => {
    expect(usesTls('off', 'postgres://h/db')).toBe(false);
    expect(usesTls('require', 'postgres://h/db')).toBe(true);
    expect(usesTls('off', 'postgres://h/db?sslmode=require')).toBe(true);
    expect(usesTls('off', 'postgres://h/db?sslmode=verify-full')).toBe(true);
    expect(usesTls('off', 'postgres://h/db?sslmode=disable')).toBe(false);
    expect(usesTls('off', 'postgres://h/db?sslmode=prefer')).toBe(false);
  });
});

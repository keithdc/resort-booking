/**
 * @file apps/api/src/shared/database/database-settings.ts
 * @shared Reads the database settings from the environment: two connections, pool sizes, TLS
 * @dependencies pg (types only)
 */

import type { PoolConfig } from 'pg';
import { isProduction, readIntEnv } from '../config/environment';

type Env = Readonly<Record<string, string | undefined>>;

/** How the connection is encrypted. `no-verify` encrypts but accepts any certificate: for a private network only. */
export type DatabaseTls = 'off' | 'require' | 'no-verify';

export interface DatabaseSettings {
  /** The least-privilege connection the API uses at run time. */
  runtimeUrl: string;
  /** The owner connection that applies migrations, or null when migrations fall back to the runtime connection. */
  migrationUrl: string | null;
  /** Apply pending migrations when the API starts. Default: yes in development and tests, never in production. */
  runMigrationsOnStart: boolean;
  tls: DatabaseTls;
  poolMax: number;
  connectionTimeoutMs: number;
  idleTimeoutMs: number;
}

/** What shows up in `pg_stat_activity.application_name`, so a DBA can tell the API's connections apart. */
export const APPLICATION_NAME = 'resort-api';

/**
 * Reads the settings. A bad number keeps its default instead of turning a limit off.
 */
export function readDatabaseSettings(env: Env): DatabaseSettings {
  const explicit = (env.RUN_MIGRATIONS_ON_START ?? '').trim().toLowerCase();
  const runMigrationsOnStart = explicit === 'true' ? true : explicit === 'false' ? false : !isProduction(env);
  return {
    runtimeUrl: (env.DATABASE_URL ?? '').trim(),
    migrationUrl: blankToNull(env.MIGRATION_DATABASE_URL),
    runMigrationsOnStart,
    tls: readTls(env.DATABASE_SSL, env.DATABASE_URL),
    poolMax: readIntEnv(env, 'DATABASE_POOL_MAX', 10, 1, 100),
    connectionTimeoutMs: readIntEnv(env, 'DATABASE_CONNECTION_TIMEOUT_MS', 5_000, 500, 60_000),
    idleTimeoutMs: readIntEnv(env, 'DATABASE_IDLE_TIMEOUT_MS', 30_000, 1_000, 600_000),
  };
}

/**
 * The connection that applies migrations: the owner URL when set, otherwise the runtime URL (development only:
 * a single superuser connection does everything). `separate` says which one was chosen.
 */
export function resolveMigrationTarget(settings: DatabaseSettings): { url: string; separate: boolean } {
  return settings.migrationUrl === null
    ? { url: settings.runtimeUrl, separate: false }
    : { url: settings.migrationUrl, separate: true };
}

/**
 * The pg pool options for one connection URL. `maxOverride` is for the short-lived migration pool (one connection).
 */
export function buildPoolConfig(url: string, settings: DatabaseSettings, maxOverride?: number): PoolConfig {
  const config: PoolConfig = {
    connectionString: url,
    max: maxOverride ?? settings.poolMax,
    connectionTimeoutMillis: settings.connectionTimeoutMs,
    idleTimeoutMillis: settings.idleTimeoutMs,
    application_name: APPLICATION_NAME,
  };
  if (settings.tls === 'require') {
    config.ssl = { rejectUnauthorized: true };
  } else if (settings.tls === 'no-verify') {
    config.ssl = { rejectUnauthorized: false };
  }
  return config;
}

/**
 * True when the URL points at this machine. A database anywhere else must be reached over TLS in production.
 */
export function isLocalDatabaseHost(url: string): boolean {
  const host = hostOf(url);
  return host === null || host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]' || host === '';
}

/**
 * True when the connection will be encrypted: the toggle, or an `sslmode` in the URL that asks for it.
 */
export function usesTls(tls: DatabaseTls, url: string): boolean {
  if (tls !== 'off') {
    return true;
  }
  const mode = new RegExp('[?&]sslmode=([a-z-]+)', 'i').exec(url)?.[1]?.toLowerCase();
  return mode === 'require' || mode === 'verify-ca' || mode === 'verify-full';
}

function readTls(toggle: string | undefined, url: string | undefined): DatabaseTls {
  const value = (toggle ?? '').trim().toLowerCase();
  if (value === 'true' || value === 'require' || value === '1') {
    return 'require';
  }
  if (value === 'no-verify') {
    return 'no-verify';
  }
  // `sslmode=require` in the URL is handled by pg itself; the toggle only adds to it.
  return usesTls('off', url ?? '') ? 'require' : 'off';
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function blankToNull(value: string | undefined): string | null {
  return value === undefined || value.trim() === '' ? null : value.trim();
}

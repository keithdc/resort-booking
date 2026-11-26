/**
 * @file apps/api/src/shared/config/database-environment.ts
 * @shared Startup check of the database settings: two roles, no migrations from the runtime role, TLS off the machine
 * @dependencies environment, database-settings
 */

import { isLocalDatabaseHost, readDatabaseSettings, usesTls } from '../database/database-settings';
import { isProduction, type EnvironmentReport } from './environment';

type Env = Readonly<Record<string, string | undefined>>;

/** Login names that almost always mean a superuser. */
const SUSPECT_USERS: readonly string[] = ['postgres', 'root', 'admin', 'superuser'];

/**
 * Checks the database environment without connecting. Production turns each unsafe finding into an error;
 * development lists them as warnings. A message never contains a password or a full URL.
 * (The role the API actually connects as is checked after connecting, by DatabaseSafetyService.)
 */
export function validateDatabaseEnvironment(env: Env): EnvironmentReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const production = isProduction(env);
  const unsafe = (message: string): void => {
    (production ? errors : warnings).push(message);
  };

  const settings = readDatabaseSettings(env);
  if (settings.runtimeUrl === '') {
    return { errors, warnings };
  }

  if (settings.migrationUrl === null) {
    unsafe(
      'MIGRATION_DATABASE_URL is not set: migrations would use DATABASE_URL, so the API role needs the right to change the schema. Use two roles: the owner for migrations, resort_app for the API (docs/11-database-access.md).',
    );
  } else if (userOf(settings.migrationUrl) !== null && userOf(settings.migrationUrl) === userOf(settings.runtimeUrl)) {
    unsafe('MIGRATION_DATABASE_URL and DATABASE_URL log in as the same database user: the API role can change the schema.');
  }
  if (production && settings.runMigrationsOnStart && settings.migrationUrl === null) {
    errors.push('RUN_MIGRATIONS_ON_START=true needs MIGRATION_DATABASE_URL in production: the API role must not run DDL.');
  }

  const runtimeUser = userOf(settings.runtimeUrl);
  if (runtimeUser !== null && SUSPECT_USERS.includes(runtimeUser.toLowerCase())) {
    unsafe(`DATABASE_URL logs in as "${runtimeUser}", which is normally a superuser. Use the resort_app role.`);
  }

  if (!isLocalDatabaseHost(settings.runtimeUrl) && !usesTls(settings.tls, settings.runtimeUrl)) {
    unsafe('DATABASE_URL points to another machine without TLS: set DATABASE_SSL=true (or sslmode=require in the URL).');
  }
  if (settings.migrationUrl !== null && !isLocalDatabaseHost(settings.migrationUrl) && !usesTls(settings.tls, settings.migrationUrl)) {
    unsafe('MIGRATION_DATABASE_URL points to another machine without TLS: set DATABASE_SSL=true (or sslmode=require in the URL).');
  }
  return { errors, warnings };
}

/**
 * Throws one Error listing every production problem, or returns the warnings for the caller to log.
 */
export function assertDatabaseEnvironment(env: Env): string[] {
  const report = validateDatabaseEnvironment(env);
  if (report.errors.length > 0) {
    throw new Error(`Refusing to start, the database configuration is unsafe:\n- ${report.errors.join('\n- ')}`);
  }
  return report.warnings;
}

function userOf(url: string): string | null {
  try {
    const name = decodeURIComponent(new URL(url).username);
    return name === '' ? null : name;
  } catch {
    return null;
  }
}

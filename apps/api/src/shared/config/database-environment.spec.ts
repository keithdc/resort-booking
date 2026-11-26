/**
 * @file apps/api/src/shared/config/database-environment.spec.ts
 * @shared Startup check of the database environment
 */

import { assertDatabaseEnvironment, validateDatabaseEnvironment } from './database-environment';

const GOOD_PRODUCTION = {
  NODE_ENV: 'production',
  DATABASE_URL: 'postgres://resort_app:s3cret@db.internal:5432/resort_booking?sslmode=require',
  MIGRATION_DATABASE_URL: 'postgres://resort_owner:other@db.internal:5432/resort_booking?sslmode=require',
};

describe('validateDatabaseEnvironment', () => {
  it('accepts a production setup with two roles over TLS', () => {
    expect(validateDatabaseEnvironment(GOOD_PRODUCTION)).toEqual({ errors: [], warnings: [] });
  });

  it('production refuses a missing MIGRATION_DATABASE_URL', () => {
    const { errors } = validateDatabaseEnvironment({ ...GOOD_PRODUCTION, MIGRATION_DATABASE_URL: undefined });

    expect(errors.join(' ')).toContain('MIGRATION_DATABASE_URL is not set');
  });

  it('production refuses the same login for both connections', () => {
    const { errors } = validateDatabaseEnvironment({ ...GOOD_PRODUCTION, MIGRATION_DATABASE_URL: GOOD_PRODUCTION.DATABASE_URL });

    expect(errors.join(' ')).toContain('same database user');
  });

  it('production refuses migrations at start without the owner URL, and accepts them with it', () => {
    const without = validateDatabaseEnvironment({ ...GOOD_PRODUCTION, MIGRATION_DATABASE_URL: undefined, RUN_MIGRATIONS_ON_START: 'true' });
    expect(without.errors.join(' ')).toContain('RUN_MIGRATIONS_ON_START=true needs MIGRATION_DATABASE_URL');

    expect(validateDatabaseEnvironment({ ...GOOD_PRODUCTION, RUN_MIGRATIONS_ON_START: 'true' }).errors).toEqual([]);
  });

  it('production refuses a superuser-looking login name', () => {
    const { errors } = validateDatabaseEnvironment({ ...GOOD_PRODUCTION, DATABASE_URL: 'postgres://postgres:pw@db.internal/resort_booking?sslmode=require' });

    expect(errors.join(' ')).toContain('"postgres"');
  });

  it('production refuses a remote database without TLS, and accepts the toggle or localhost', () => {
    const remote = { ...GOOD_PRODUCTION, DATABASE_URL: 'postgres://resort_app:pw@db.internal/resort_booking', MIGRATION_DATABASE_URL: 'postgres://resort_owner:pw@db.internal/resort_booking' };
    expect(validateDatabaseEnvironment(remote).errors.join(' ')).toContain('without TLS');
    expect(validateDatabaseEnvironment({ ...remote, DATABASE_SSL: 'true' }).errors).toEqual([]);
    const local = { ...remote, DATABASE_URL: 'postgres://resort_app:pw@localhost/resort_booking', MIGRATION_DATABASE_URL: 'postgres://resort_owner:pw@localhost/resort_booking' };
    expect(validateDatabaseEnvironment(local).errors).toEqual([]);
  });

  it('development turns the same findings into warnings, including the single-URL setup', () => {
    const { errors, warnings } = validateDatabaseEnvironment({ NODE_ENV: 'development', DATABASE_URL: 'postgres://resort:resort@localhost:5433/resort_booking' });

    expect(errors).toEqual([]);
    expect(warnings.join(' ')).toContain('MIGRATION_DATABASE_URL is not set');
  });

  it('never prints a password or a URL', () => {
    const report = validateDatabaseEnvironment({ NODE_ENV: 'production', DATABASE_URL: 'postgres://postgres:hunter2pw@db.example.org/x' });

    const text = [...report.errors, ...report.warnings].join(' ');
    expect(text).not.toContain('hunter2pw');
    expect(text).not.toContain('db.example.org');
  });

  it('says nothing when DATABASE_URL is missing: the main check already reports that', () => {
    expect(validateDatabaseEnvironment({ NODE_ENV: 'production' })).toEqual({ errors: [], warnings: [] });
  });
});

describe('assertDatabaseEnvironment', () => {
  it('throws one error listing every production problem', () => {
    expect(() => assertDatabaseEnvironment({ NODE_ENV: 'production', DATABASE_URL: 'postgres://postgres:pw@db.internal/x' })).toThrow(/Refusing to start, the database configuration is unsafe[\s\S]*MIGRATION_DATABASE_URL[\s\S]*postgres[\s\S]*TLS/);
  });

  it('returns the warnings in development', () => {
    expect(assertDatabaseEnvironment({ NODE_ENV: 'development', DATABASE_URL: 'postgres://resort:resort@localhost/x' })).toHaveLength(1);
  });
});

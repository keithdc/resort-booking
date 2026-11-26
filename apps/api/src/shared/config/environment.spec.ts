/**
 * @file apps/api/src/shared/config/environment.spec.ts
 * @shared Startup configuration check
 */

import { assertEnvironment, isProduction, readIntEnv, validateEnvironment } from './environment';

const BASE = {
  DATABASE_URL: 'postgres://app@db/app',
  REDIS_URL: 'redis://cache:6379',
  CORS_ORIGINS: 'https://book.example.com,https://admin.example.com',
  PAYMENT_PROVIDER: 'stripe',
  TRUST_PROXY: '1',
  TWO_FACTOR_ENCRYPTION_KEY: 'ab'.repeat(32),
};

describe('validateEnvironment in production', () => {
  const production = { ...BASE, NODE_ENV: 'production' };

  it('passes a safe configuration with no findings', () => {
    expect(validateEnvironment(production)).toEqual({ errors: [], warnings: [] });
  });

  it('requires the database and redis settings', () => {
    const report = validateEnvironment({ ...production, DATABASE_URL: '', REDIS_URL: undefined });

    expect(report.errors).toEqual(['DATABASE_URL is not set.', 'REDIS_URL is not set.']);
  });

  it('refuses a missing, wildcard or localhost CORS list and plain http', () => {
    expect(validateEnvironment({ ...production, CORS_ORIGINS: undefined }).errors[0]).toContain('CORS_ORIGINS is not set');
    expect(validateEnvironment({ ...production, CORS_ORIGINS: '*' }).errors.join(' ')).toContain('"*"');
    expect(validateEnvironment({ ...production, CORS_ORIGINS: 'https://x.com,http://localhost:3000' }).errors.join(' ')).toContain('localhost');
    expect(validateEnvironment({ ...production, CORS_ORIGINS: 'http://book.example.com' }).errors.join(' ')).toContain('non-https');
  });

  it('refuses the mock payment provider, also when the setting is missing', () => {
    expect(validateEnvironment({ ...production, PAYMENT_PROVIDER: 'mock' }).errors.join(' ')).toContain('mock');
    expect(validateEnvironment({ ...production, PAYMENT_PROVIDER: undefined }).errors.join(' ')).toContain('mock');
  });

  it('warns, but does not refuse, when TRUST_PROXY is missing or the retired STAFF_TOKEN is set', () => {
    const report = validateEnvironment({ ...production, TRUST_PROXY: undefined, STAFF_TOKEN: 'x' });

    expect(report.errors).toEqual([]);
    expect(report.warnings.join(' ')).toContain('TRUST_PROXY');
    expect(report.warnings.join(' ')).toContain('STAFF_TOKEN');
  });

  it('never repeats a secret value in a message', () => {
    const report = validateEnvironment({ ...production, DATABASE_URL: 'postgres://user:hunter2@db/app', STAFF_TOKEN: 'secret-token-value', PAYMENT_PROVIDER: 'mock' });

    expect(JSON.stringify(report)).not.toContain('hunter2');
    expect(JSON.stringify(report)).not.toContain('secret-token-value');
  });
});

describe('TWO_FACTOR_ENCRYPTION_KEY', () => {
  const production = { ...BASE, NODE_ENV: 'production' };

  it('is required in production', () => {
    for (const missing of [undefined, '', '   ']) {
      expect(validateEnvironment({ ...production, TWO_FACTOR_ENCRYPTION_KEY: missing }).errors.join(' ')).toContain('TWO_FACTOR_ENCRYPTION_KEY is not set');
    }
  });

  it('may be missing in development (a development key is used with a warning from the cipher)', () => {
    expect(validateEnvironment({ ...BASE, NODE_ENV: 'development', TWO_FACTOR_ENCRYPTION_KEY: undefined }).errors).toEqual([]);
  });

  it('must be 32 bytes as hex or base64, in any environment', () => {
    expect(validateEnvironment({ ...production, TWO_FACTOR_ENCRYPTION_KEY: 'short' }).errors.join(' ')).toContain('malformed');
    expect(validateEnvironment({ ...BASE, NODE_ENV: 'development', TWO_FACTOR_ENCRYPTION_KEY: 'short' }).errors.join(' ')).toContain('malformed');
    expect(validateEnvironment({ ...production, TWO_FACTOR_ENCRYPTION_KEY: Buffer.alloc(32, 1).toString('base64') }).errors).toEqual([]);
    expect(validateEnvironment(production).errors).toEqual([]);
  });

  it('never prints the key', () => {
    const report = validateEnvironment({ ...production, TWO_FACTOR_ENCRYPTION_KEY: 'top-secret-but-wrong' });
    expect(JSON.stringify(report)).not.toContain('top-secret-but-wrong');
  });
});

describe('validateEnvironment in development', () => {
  it('turns the unsafe findings into warnings instead of errors', () => {
    const report = validateEnvironment({
      NODE_ENV: 'development',
      DATABASE_URL: 'postgres://resort@localhost/db',
      REDIS_URL: 'redis://localhost:6380',
      CORS_ORIGINS: 'http://localhost:3000',
      PAYMENT_PROVIDER: 'mock',
    });

    expect(report.errors).toEqual([]);
    expect(report.warnings.length).toBe(2);
  });

  it('still errors on a missing database or redis setting', () => {
    expect(validateEnvironment({ NODE_ENV: 'development' }).errors).toHaveLength(2);
  });

  it('suggests setting NODE_ENV when it is missing', () => {
    expect(validateEnvironment({ ...BASE }).warnings.join(' ')).toContain('NODE_ENV');
  });
});

describe('assertEnvironment', () => {
  it('throws one error listing every production problem', () => {
    expect(() => assertEnvironment({ NODE_ENV: 'production', DATABASE_URL: 'x', REDIS_URL: 'y', PAYMENT_PROVIDER: 'mock' })).toThrow(/Refusing to start[\s\S]*CORS_ORIGINS[\s\S]*mock/);
  });

  it('returns the warnings when nothing is fatal', () => {
    expect(assertEnvironment({ ...BASE, NODE_ENV: 'development' })).toEqual([]);
  });
});

describe('isProduction and readIntEnv', () => {
  it('detects production', () => {
    expect(isProduction({ NODE_ENV: 'production' })).toBe(true);
    expect(isProduction({ NODE_ENV: 'development' })).toBe(false);
    expect(isProduction({})).toBe(false);
  });

  it('reads a whole number in range, otherwise uses the fallback', () => {
    expect(readIntEnv({ N: '7' }, 'N', 5, 1, 10)).toBe(7);
    expect(readIntEnv({}, 'N', 5, 1, 10)).toBe(5);
    expect(readIntEnv({ N: ' ' }, 'N', 5, 1, 10)).toBe(5);
    expect(readIntEnv({ N: 'abc' }, 'N', 5, 1, 10)).toBe(5);
    expect(readIntEnv({ N: '2.5' }, 'N', 5, 1, 10)).toBe(5);
    expect(readIntEnv({ N: '0' }, 'N', 5, 1, 10)).toBe(5);
    expect(readIntEnv({ N: '11' }, 'N', 5, 1, 10)).toBe(5);
  });
});

describe('validateEnvironment: mail settings', () => {
  const production = { ...BASE, NODE_ENV: 'production' };
  const mail = { RESEND_API_KEY: 're_x', MAIL_FROM: 'Humphreys <staff@example.com>', ADMIN_APP_URL: 'https://admin.example.com' };

  it('production without a mail key stays clean (copy-the-link mode)', () => {
    expect(validateEnvironment(production)).toEqual({ errors: [], warnings: [] });
  });

  it('accepts a complete mail configuration', () => {
    expect(validateEnvironment({ ...production, ...mail })).toEqual({ errors: [], warnings: [] });
  });

  it('refuses a key without MAIL_FROM or ADMIN_APP_URL, and http in production', () => {
    expect(validateEnvironment({ ...production, RESEND_API_KEY: 're_x' }).errors).toHaveLength(2);
    expect(validateEnvironment({ ...production, ...mail, ADMIN_APP_URL: 'http://admin.example.com' }).errors.join(' ')).toContain('https');
  });

  it('refuses a half-configured mail setup in development too', () => {
    expect(validateEnvironment({ ...BASE, NODE_ENV: 'development', RESEND_API_KEY: 're_x' }).errors).toHaveLength(2);
  });
});

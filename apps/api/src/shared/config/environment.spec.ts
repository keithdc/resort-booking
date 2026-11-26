/**
 * @file apps/api/src/shared/config/environment.spec.ts
 * @shared Startup configuration check
 */

import { assertEnvironment, isDevelopmentMode, isProduction, readIntEnv, resolveIpHashSalt, validateEnvironment } from './environment';

const BASE = {
  DATABASE_URL: 'postgres://app@db/app',
  REDIS_URL: 'redis://cache:6379',
  CORS_ORIGINS: 'https://book.example.com,https://admin.example.com',
  PAYMENT_PROVIDER: 'stripe',
  PAYMENT_WEBHOOK_SECRET: 'whsec_' + 'k'.repeat(30),
  TRUST_PROXY: '1',
  TWO_FACTOR_ENCRYPTION_KEY: 'ab'.repeat(32),
  IP_HASH_SALT: 'x'.repeat(40),
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

  it('refuses ALLOW_MOCK_PAYMENTS=true: the opt-in is never honoured on a production-like run', () => {
    expect(validateEnvironment({ ...production, ALLOW_MOCK_PAYMENTS: 'true' }).errors.join(' ')).toContain('ALLOW_MOCK_PAYMENTS');
  });

  it('requires a 32+ character IP_HASH_SALT', () => {
    expect(validateEnvironment({ ...production, IP_HASH_SALT: undefined }).errors.join(' ')).toContain('IP_HASH_SALT is not set');
    expect(validateEnvironment({ ...production, IP_HASH_SALT: 'short' }).errors.join(' ')).toContain('IP_HASH_SALT is too short');
    expect(validateEnvironment({ ...production, IP_HASH_SALT: 'x'.repeat(32) }).errors).toEqual([]);
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

describe('payment webhook secret', () => {
  const production = { ...BASE, NODE_ENV: 'production' };

  it('is required for a real provider and never printed', () => {
    const report = validateEnvironment({ ...production, PAYMENT_WEBHOOK_SECRET: undefined });

    expect(report.errors).toEqual(['PAYMENT_WEBHOOK_SECRET is not set: a real payment provider ("stripe") needs it to verify the signature of its webhooks.']);
  });

  it('refuses a short secret and a previous secret without a current one, without echoing either', () => {
    const short = validateEnvironment({ ...production, PAYMENT_WEBHOOK_SECRET: 'hunter2' });
    const orphan = validateEnvironment({ ...production, PAYMENT_WEBHOOK_SECRET: undefined, PAYMENT_WEBHOOK_SECRET_PREVIOUS: 'p'.repeat(30) });

    expect(short.errors.join(' ')).toContain('PAYMENT_WEBHOOK_SECRET is too short');
    expect(JSON.stringify(short)).not.toContain('hunter2');
    expect(orphan.errors.join(' ')).toContain('PAYMENT_WEBHOOK_SECRET_PREVIOUS is set without PAYMENT_WEBHOOK_SECRET');
    expect(JSON.stringify(orphan)).not.toContain('p'.repeat(30));
  });

  it('is optional for the mock (the endpoint is simply off without it)', () => {
    const report = validateEnvironment({ NODE_ENV: 'development', DATABASE_URL: 'x', REDIS_URL: 'y', PAYMENT_PROVIDER: 'mock', ALLOW_MOCK_PAYMENTS: 'true', CORS_ORIGINS: 'http://localhost:3000' });

    expect(report.errors).toEqual([]);
  });

  it('accepts a rotation with both secrets set', () => {
    expect(validateEnvironment({ ...production, PAYMENT_WEBHOOK_SECRET_PREVIOUS: 'o'.repeat(30) }).errors).toEqual([]);
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
      ALLOW_MOCK_PAYMENTS: 'true',
      IP_HASH_SALT: 'x'.repeat(32),
    });

    expect(report.errors).toEqual([]);
    expect(report.warnings.length).toBe(2);
  });

  it('refuses the mock provider unless ALLOW_MOCK_PAYMENTS=true opts in, also in development', () => {
    const dev = { NODE_ENV: 'development', DATABASE_URL: 'postgres://resort@localhost/db', REDIS_URL: 'redis://localhost:6380', CORS_ORIGINS: 'http://localhost:3000', IP_HASH_SALT: 'x'.repeat(32) };

    expect(validateEnvironment({ ...dev, PAYMENT_PROVIDER: 'mock' }).errors.join(' ')).toContain('ALLOW_MOCK_PAYMENTS=true');
    expect(validateEnvironment({ ...dev }).errors.join(' ')).toContain('ALLOW_MOCK_PAYMENTS=true');
    expect(validateEnvironment({ ...dev, ALLOW_MOCK_PAYMENTS: 'TRUE' }).errors).toEqual([]);
  });

  it('only warns about a missing IP_HASH_SALT', () => {
    const report = validateEnvironment({ ...BASE, NODE_ENV: 'development', IP_HASH_SALT: undefined });

    expect(report.errors).toEqual([]);
    expect(report.warnings.join(' ')).toContain('IP_HASH_SALT');
  });

  it('still errors on a missing database or redis setting', () => {
    expect(validateEnvironment({ NODE_ENV: 'development', ALLOW_MOCK_PAYMENTS: 'true' }).errors).toEqual(['DATABASE_URL is not set.', 'REDIS_URL is not set.']);
  });

});

describe('strict mode (R2-04): anything but an explicit development or test run is production-like', () => {
  it.each([undefined, '', 'staging', 'prod', 'Production', 'Development', 'dev'])('NODE_ENV=%j is strict and refuses to start', (value) => {
    const env = { ...BASE, NODE_ENV: value, PAYMENT_PROVIDER: 'mock', CORS_ORIGINS: 'http://localhost:3000', IP_HASH_SALT: undefined };

    expect(isProduction(env)).toBe(true);
    expect(isDevelopmentMode(env)).toBe(false);
    const errors = validateEnvironment(env).errors.join(' ');
    expect(errors).toContain('NODE_ENV');
    expect(errors).toContain('mock');
    expect(errors).toContain('CORS_ORIGINS');
    expect(errors).toContain('IP_HASH_SALT');
    expect(() => assertEnvironment(env)).toThrow(/Refusing to start/);
  });

  it('a safe configuration still needs a known NODE_ENV', () => {
    expect(validateEnvironment({ ...BASE, NODE_ENV: 'staging' }).errors).toHaveLength(1);
    expect(validateEnvironment({ ...BASE, NODE_ENV: undefined }).errors.join(' ')).toContain('NODE_ENV is not set');
  });

  it('development and test are the only relaxed modes', () => {
    expect(isDevelopmentMode({ NODE_ENV: 'development' })).toBe(true);
    expect(isDevelopmentMode({ NODE_ENV: 'test' })).toBe(true);
    expect(isDevelopmentMode({ NODE_ENV: 'production' })).toBe(false);
  });
});

describe('resolveIpHashSalt', () => {
  it('returns the configured salt, trimmed', () => {
    expect(resolveIpHashSalt(' pepper ', { NODE_ENV: 'production' })).toBe('pepper');
  });

  it('falls back to an empty salt only in development or test', () => {
    expect(resolveIpHashSalt(undefined, { NODE_ENV: 'development' })).toBe('');
    expect(resolveIpHashSalt('  ', { NODE_ENV: 'test' })).toBe('');
  });

  it('refuses to start without a salt in any other mode', () => {
    expect(() => resolveIpHashSalt(undefined, { NODE_ENV: 'production' })).toThrow('IP_HASH_SALT is not set');
    expect(() => resolveIpHashSalt('', {})).toThrow('IP_HASH_SALT is not set');
    expect(() => resolveIpHashSalt(undefined, { NODE_ENV: 'staging' })).toThrow('IP_HASH_SALT');
  });
});

describe('assertEnvironment', () => {
  it('throws one error listing every production problem', () => {
    expect(() => assertEnvironment({ NODE_ENV: 'production', DATABASE_URL: 'x', REDIS_URL: 'y', PAYMENT_PROVIDER: 'mock' })).toThrow(/Refusing to start[\s\S]*CORS_ORIGINS[\s\S]*mock/);
  });

  it('returns the warnings when nothing is fatal', () => {
    expect(assertEnvironment({ ...BASE, NODE_ENV: 'development', PAYMENT_PROVIDER: 'stripe' })).toEqual([]);
  });
});

describe('isProduction and readIntEnv', () => {
  it('detects production', () => {
    expect(isProduction({ NODE_ENV: 'production' })).toBe(true);
    expect(isProduction({ NODE_ENV: 'development' })).toBe(false);
    expect(isProduction({})).toBe(true);
    expect(isProduction({ NODE_ENV: 'staging' })).toBe(true);
    expect(isProduction({ NODE_ENV: 'test' })).toBe(false);
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

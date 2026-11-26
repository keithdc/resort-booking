/**
 * @file apps/api/src/shared/config/environment.ts
 * @shared Startup configuration check: fail fast on unsafe production settings, warn in development
 * @dependencies mail.config
 */

import { mailEnvironmentProblems } from '../mail/mail.config';

export interface EnvironmentReport {
  /** Problems that make production unsafe or unusable. */
  errors: string[];
  /** Things worth fixing that do not stop a development run. */
  warnings: string[];
}

type Env = Readonly<Record<string, string | undefined>>;

const LOCAL_HOST = /(^|\/\/)(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)(:|\/|$)/i;

/**
 * True when this process runs as production (NODE_ENV=production).
 */
export function isProduction(env: Env): boolean {
  return env.NODE_ENV === 'production';
}

/**
 * True only for a developer's machine (NODE_ENV=development). Tests and every other value count as "not development",
 * so a rule that is relaxed here stays strict in CI and on servers.
 */
export function isDevelopment(env: Env): boolean {
  return env.NODE_ENV === 'development';
}

/**
 * Checks the environment without touching the database. Production turns `unsafe` findings into errors;
 * development reports them as warnings. Never includes a secret value in a message.
 */
export function validateEnvironment(env: Env): EnvironmentReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const production = isProduction(env);
  const unsafe = (message: string): void => {
    (production ? errors : warnings).push(message);
  };

  if (blank(env.DATABASE_URL)) {
    errors.push('DATABASE_URL is not set.');
  }
  if (blank(env.REDIS_URL)) {
    errors.push('REDIS_URL is not set.');
  }

  const origins = (env.CORS_ORIGINS ?? '')
    .split(',')
    .map((origin: string): string => origin.trim())
    .filter((origin: string): boolean => origin !== '');
  if (origins.length === 0) {
    unsafe('CORS_ORIGINS is not set: list the exact https origins of the guest and admin sites.');
  }
  if (origins.includes('*')) {
    unsafe('CORS_ORIGINS contains "*": any website could call the API from a browser.');
  }
  if (origins.some((origin: string): boolean => LOCAL_HOST.test(origin))) {
    unsafe('CORS_ORIGINS contains a localhost address: use the real site origins.');
  }
  if (production && origins.some((origin: string): boolean => origin.startsWith('http://'))) {
    errors.push('CORS_ORIGINS contains a non-https origin.');
  }

  const provider = (env.PAYMENT_PROVIDER ?? 'mock').trim().toLowerCase();
  if (provider === 'mock') {
    unsafe('PAYMENT_PROVIDER is "mock": payments are simulated and no money moves.');
  }

  // Two-factor secrets are encrypted with this key. Production must set it; a malformed key is wrong anywhere.
  // (Development without a key is allowed: the cipher warns and uses a fixed development key.)
  const twoFactorKey = env.TWO_FACTOR_ENCRYPTION_KEY?.trim() ?? '';
  if (twoFactorKey === '') {
    if (production) {
      errors.push('TWO_FACTOR_ENCRYPTION_KEY is not set: it encrypts staff two-factor secrets (32 random bytes as 64 hex characters).');
    }
  } else if (!/^[0-9a-fA-F]{64}$/.test(twoFactorKey) && !/^[A-Za-z0-9+/_-]{43}=?$/.test(twoFactorKey)) {
    errors.push('TWO_FACTOR_ENCRYPTION_KEY is malformed: use 32 random bytes as 64 hex characters (or base64).');
  }
  const mail = mailEnvironmentProblems(env, production);
  errors.push(...mail.errors);
  warnings.push(...mail.warnings);
  if (!blank(env.STAFF_TOKEN)) {
    warnings.push('STAFF_TOKEN is set but no longer used: staff sign in with a password. Remove it.');
  }
  if (production && blank(env.TRUST_PROXY)) {
    warnings.push(
      'TRUST_PROXY is not set. Behind a reverse proxy set it to the number of proxy hops, or every guest looks like one IP and rate limits apply to all of them together.',
    );
  }
  if (!production && env.NODE_ENV === undefined) {
    warnings.push('NODE_ENV is not set: treated as development. Set NODE_ENV=production on a server.');
  }

  return { errors, warnings };
}

/**
 * Throws one Error listing every production problem, or returns the warnings for the caller to log.
 */
export function assertEnvironment(env: Env): string[] {
  const report = validateEnvironment(env);
  if (report.errors.length > 0) {
    throw new Error(`Refusing to start, the configuration is unsafe:\n- ${report.errors.join('\n- ')}`);
  }
  return report.warnings;
}

/**
 * Reads an integer setting, falling back to `fallback` when it is missing, not a whole number or outside
 * [min, max]. A bad value never silently disables a limit.
 */
export function readIntEnv(env: Env, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }
  const value = Number(raw);
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

function blank(value: string | undefined): boolean {
  return value === undefined || value.trim() === '';
}

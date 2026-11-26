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

/** The only NODE_ENV values that switch development conveniences on (mock payments, open sign-up, dev keys). */
const DEVELOPMENT_MODES: readonly string[] = ['development', 'test'];

/** Every NODE_ENV value the API accepts. Anything else (unset, "staging", "prod", a typo) stops the start. */
const KNOWN_MODES: readonly string[] = [...DEVELOPMENT_MODES, 'production'];

/** Shortest accepted payment webhook secret (a shared HMAC key). */
export const WEBHOOK_SECRET_MIN_LENGTH = 16;

/** Shortest accepted IP_HASH_SALT outside development. */
export const IP_HASH_SALT_MIN_LENGTH = 32;

/**
 * True only on an explicit developer or test run (NODE_ENV=development or NODE_ENV=test). Every other value,
 * including an unset NODE_ENV, counts as "not a development run" so a forgotten or mistyped setting fails safe.
 */
export function isDevelopmentMode(env: Env): boolean {
  return env.NODE_ENV !== undefined && DEVELOPMENT_MODES.includes(env.NODE_ENV);
}

/**
 * True when this process must behave like production: everything except an explicit development or test run.
 * (So NODE_ENV unset, "staging" and "Production" are strict too; startup then refuses the unknown values.)
 */
export function isProduction(env: Env): boolean {
  return !isDevelopmentMode(env);
}

/**
 * The salt for the one-way IP and email hashes (IP_HASH_SALT). Required outside development; a development run
 * without one keeps hashing with an empty salt (as before, so existing development rows stay comparable).
 * Rotating the salt changes every hash: old audit rows are no longer matched to new ones.
 */
export function resolveIpHashSalt(value: string | undefined, env: Env = process.env): string {
  const salt = value?.trim() ?? '';
  if (salt === '' && isProduction(env)) {
    throw new Error('IP_HASH_SALT is not set: it is required outside development (32+ random characters).');
  }
  return salt;
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

  if (env.NODE_ENV === undefined || !KNOWN_MODES.includes(env.NODE_ENV)) {
    errors.push(
      env.NODE_ENV === undefined || env.NODE_ENV.trim() === ''
        ? 'NODE_ENV is not set: use NODE_ENV=production on a server (NODE_ENV=development only on a developer machine). Anything but development or test is treated as production.'
        : `NODE_ENV is "${env.NODE_ENV}": use production, development or test. Anything but development or test is treated as production.`,
    );
  }

  const provider = (env.PAYMENT_PROVIDER ?? 'mock').trim().toLowerCase();
  const mockAllowed = (env.ALLOW_MOCK_PAYMENTS ?? '').trim().toLowerCase() === 'true';
  if (provider === 'mock') {
    unsafe('PAYMENT_PROVIDER is "mock": payments are simulated and no money moves.');
    if (!production && !mockAllowed) {
      errors.push('PAYMENT_PROVIDER is "mock": set ALLOW_MOCK_PAYMENTS=true to opt in to simulated payments (development only).');
    }
  }
  if (production && mockAllowed) {
    errors.push('ALLOW_MOCK_PAYMENTS=true is set on a production-like run (NODE_ENV is not development or test): remove it, anyone could confirm a stay without paying.');
  }

  // Payment webhooks (docs/14): a real provider cannot be trusted without a signed webhook, and a weak secret is no secret.
  const webhookSecret = env.PAYMENT_WEBHOOK_SECRET?.trim() ?? '';
  if (provider !== 'mock' && webhookSecret === '') {
    errors.push(`PAYMENT_WEBHOOK_SECRET is not set: a real payment provider ("${provider}") needs it to verify the signature of its webhooks.`);
  }
  for (const name of ['PAYMENT_WEBHOOK_SECRET', 'PAYMENT_WEBHOOK_SECRET_PREVIOUS']) {
    const value = env[name]?.trim() ?? '';
    if (value !== '' && value.length < WEBHOOK_SECRET_MIN_LENGTH) {
      errors.push(`${name} is too short: use at least ${String(WEBHOOK_SECRET_MIN_LENGTH)} random characters.`);
    }
  }
  if ((env.PAYMENT_WEBHOOK_SECRET_PREVIOUS?.trim() ?? '') !== '' && webhookSecret === '') {
    errors.push('PAYMENT_WEBHOOK_SECRET_PREVIOUS is set without PAYMENT_WEBHOOK_SECRET.');
  }

  const ipSalt = env.IP_HASH_SALT?.trim() ?? '';
  if (production && ipSalt.length < IP_HASH_SALT_MIN_LENGTH) {
    errors.push(`IP_HASH_SALT is ${ipSalt === '' ? 'not set' : 'too short'}: use ${String(IP_HASH_SALT_MIN_LENGTH)}+ random characters (it protects the stored IP and email hashes).`);
  } else if (!production && ipSalt === '') {
    warnings.push('IP_HASH_SALT is not set: IP and email hashes are unsalted (fine for development, required elsewhere).');
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

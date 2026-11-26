/**
 * @file apps/api/src/shared/privacy/privacy-config.ts
 * @shared Retention periods and batch limits for `npm run privacy:retention`, read from the environment
 * @dependencies none: pure, so the rules can be tested without a database
 *
 * Every period is a PROPOSED default (docs/15): the owner and their lawyer confirm or change them. A value that is
 * not a whole number in range is an ERROR, never a silent fallback: this job deletes data, so a typo must not
 * quietly shorten (or lengthen) a retention period.
 */

type Env = Readonly<Record<string, string | undefined>>;

export interface RetentionConfig {
  /** Days after check-out before a guest's name, email, phone and notes are replaced (PRIVACY_GUEST_RETENTION_DAYS). */
  guestDays: number;
  /** Days after creation before an abandoned checkout's personal data is replaced (PRIVACY_HOLD_RETENTION_DAYS). */
  holdDays: number;
  /** Days after an invitation was accepted, revoked or expired before it is deleted (PRIVACY_INVITE_RETENTION_DAYS). */
  inviteDays: number;
  /** Days after expiry before a staff session or two-factor challenge is deleted (PRIVACY_SESSION_GRACE_DAYS). */
  sessionGraceDays: number;
  /** Days before a finished payment webhook event row is deleted (PRIVACY_WEBHOOK_RETENTION_DAYS). */
  webhookDays: number;
  /** Days before audit rows lose their IP hash and the staff name in their details (PRIVACY_AUDIT_ANONYMISE_DAYS). */
  auditAnonymiseDays: number;
  /** Days before audit rows that belong to no organization (failed sign-ins) are deleted (PRIVACY_AUDIT_ORPHAN_DAYS). */
  auditOrphanDays: number;
  /** Days before any audit row is deleted (PRIVACY_AUDIT_RETENTION_DAYS). */
  auditRetentionDays: number;
  /** Rows per transaction (PRIVACY_BATCH_SIZE). */
  batchSize: number;
  /** Most batches one step runs per invocation (PRIVACY_MAX_BATCHES): a run is bounded, the next run continues. */
  maxBatches: number;
}

/** The proposed defaults. Keep in step with docs/15 (the data map) and `.env.example`. */
export const DEFAULT_RETENTION: Readonly<RetentionConfig> = {
  guestDays: 1095,
  holdDays: 30,
  inviteDays: 30,
  sessionGraceDays: 0,
  webhookDays: 90,
  auditAnonymiseDays: 365,
  auditOrphanDays: 90,
  auditRetentionDays: 730,
  batchSize: 500,
  maxBatches: 200,
};

interface Setting {
  key: keyof RetentionConfig;
  env: string;
  min: number;
  max: number;
}

const SETTINGS: readonly Setting[] = [
  { key: 'guestDays', env: 'PRIVACY_GUEST_RETENTION_DAYS', min: 30, max: 3650 },
  { key: 'holdDays', env: 'PRIVACY_HOLD_RETENTION_DAYS', min: 1, max: 365 },
  { key: 'inviteDays', env: 'PRIVACY_INVITE_RETENTION_DAYS', min: 1, max: 365 },
  { key: 'sessionGraceDays', env: 'PRIVACY_SESSION_GRACE_DAYS', min: 0, max: 90 },
  { key: 'webhookDays', env: 'PRIVACY_WEBHOOK_RETENTION_DAYS', min: 30, max: 3650 },
  { key: 'auditAnonymiseDays', env: 'PRIVACY_AUDIT_ANONYMISE_DAYS', min: 30, max: 3650 },
  { key: 'auditOrphanDays', env: 'PRIVACY_AUDIT_ORPHAN_DAYS', min: 7, max: 3650 },
  { key: 'auditRetentionDays', env: 'PRIVACY_AUDIT_RETENTION_DAYS', min: 30, max: 3650 },
  { key: 'batchSize', env: 'PRIVACY_BATCH_SIZE', min: 1, max: 5000 },
  { key: 'maxBatches', env: 'PRIVACY_MAX_BATCHES', min: 1, max: 100000 },
];

/**
 * Reads the periods. Unset or blank keeps the proposed default; anything else must be a plain whole number inside the
 * setting's range, or the whole run is refused with a message naming the variable.
 */
export function readRetentionConfig(env: Env): RetentionConfig {
  const config: RetentionConfig = { ...DEFAULT_RETENTION };
  for (const setting of SETTINGS) {
    const raw = env[setting.env]?.trim() ?? '';
    if (raw === '') {
      continue;
    }
    if (!/^\d{1,7}$/.test(raw)) {
      throw new Error(`${setting.env} must be a whole number (got "${raw.slice(0, 20)}").`);
    }
    const value = Number(raw);
    if (value < setting.min || value > setting.max) {
      throw new Error(`${setting.env} must be between ${String(setting.min)} and ${String(setting.max)} (got ${raw}).`);
    }
    config[setting.key] = value;
  }
  if (config.auditAnonymiseDays > config.auditRetentionDays) {
    throw new Error('PRIVACY_AUDIT_ANONYMISE_DAYS must not be longer than PRIVACY_AUDIT_RETENTION_DAYS.');
  }
  return config;
}

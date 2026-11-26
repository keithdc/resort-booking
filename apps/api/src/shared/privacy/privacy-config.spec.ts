/**
 * @file apps/api/src/shared/privacy/privacy-config.spec.ts
 * The proposed retention defaults and the strict reading of the environment.
 */

import { DEFAULT_RETENTION, readRetentionConfig } from './privacy-config';

describe('readRetentionConfig', () => {
  it('uses the proposed defaults when nothing is set', () => {
    expect(readRetentionConfig({})).toEqual(DEFAULT_RETENTION);
    expect(DEFAULT_RETENTION).toMatchObject({ guestDays: 1095, holdDays: 30, inviteDays: 30, webhookDays: 90, auditAnonymiseDays: 365, auditRetentionDays: 730 });
  });

  it('treats a blank value as unset', () => {
    expect(readRetentionConfig({ PRIVACY_GUEST_RETENTION_DAYS: '  ' }).guestDays).toBe(1095);
  });

  it('reads overrides', () => {
    expect(readRetentionConfig({ PRIVACY_GUEST_RETENTION_DAYS: '365', PRIVACY_BATCH_SIZE: '10' })).toMatchObject({ guestDays: 365, batchSize: 10 });
  });

  it('refuses a typo instead of falling back, because the job deletes data', () => {
    expect(() => readRetentionConfig({ PRIVACY_GUEST_RETENTION_DAYS: '3y' })).toThrow(/PRIVACY_GUEST_RETENTION_DAYS must be a whole number/);
    expect(() => readRetentionConfig({ PRIVACY_HOLD_RETENTION_DAYS: '-1' })).toThrow(/whole number/);
    expect(() => readRetentionConfig({ PRIVACY_GUEST_RETENTION_DAYS: '1' })).toThrow(/between 30 and 3650/);
    expect(() => readRetentionConfig({ PRIVACY_BATCH_SIZE: '0' })).toThrow(/between 1 and 5000/);
  });

  it('refuses an anonymise period longer than the delete period of the audit log', () => {
    expect(() => readRetentionConfig({ PRIVACY_AUDIT_ANONYMISE_DAYS: '800' })).toThrow(/must not be longer/);
  });
});

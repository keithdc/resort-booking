/**
 * @file apps/api/src/shared/privacy/privacy-hash.spec.ts
 * Email normalisation and the keyed hash that goes into the ledger and the audit entry.
 */

import { isPlausibleEmail, normaliseEmail, resolvePrivacySalt, subjectHash } from './privacy-hash';

describe('privacy hash', () => {
  it('normalises case and surrounding spaces', () => {
    expect(normaliseEmail('  Ada@Example.COM ')).toBe('ada@example.com');
    expect(subjectHash(' ADA@example.com', 'salt')).toBe(subjectHash('ada@example.com', 'salt'));
  });

  it('is keyed: another salt gives another hash, and the address is not in it', () => {
    const hash = subjectHash('ada@example.com', 'one');

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toBe(subjectHash('ada@example.com', 'two'));
    expect(hash).not.toContain('ada');
  });

  it('checks the shape of an email argument', () => {
    expect(isPlausibleEmail('a@b.co')).toBe(true);
    expect(isPlausibleEmail('no-at-sign')).toBe(false);
    expect(isPlausibleEmail('two@@signs')).toBe(false);
    expect(isPlausibleEmail('with space@x.io')).toBe(false);
  });

  it('prefers PRIVACY_HASH_SALT, falls back to IP_HASH_SALT, and demands a long one outside development', () => {
    const long = 'x'.repeat(40);

    expect(resolvePrivacySalt({ NODE_ENV: 'development' })).toBe('');
    expect(resolvePrivacySalt({ NODE_ENV: 'development', IP_HASH_SALT: 'ip', PRIVACY_HASH_SALT: 'privacy' })).toBe('privacy');
    expect(resolvePrivacySalt({ NODE_ENV: 'production', IP_HASH_SALT: long })).toBe(long);
    expect(() => resolvePrivacySalt({ NODE_ENV: 'production', IP_HASH_SALT: 'short' })).toThrow(/32\+/);
    expect(() => resolvePrivacySalt({})).toThrow(/32\+/);
  });
});

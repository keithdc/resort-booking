/**
 * @file apps/api/src/shared/http/client-ip.spec.ts
 * @shared Client IP, trust proxy and fingerprint helpers
 */

import { clientIp, fingerprint, trustProxySetting } from './client-ip';

describe('clientIp', () => {
  it('returns the address Express worked out', () => {
    expect(clientIp({ ip: '203.0.113.9' })).toBe('203.0.113.9');
  });

  it('is undefined with no address', () => {
    expect(clientIp({})).toBeUndefined();
    expect(clientIp({ ip: '' })).toBeUndefined();
  });
});

describe('trustProxySetting', () => {
  it('is false when unset, so X-Forwarded-For cannot be spoofed', () => {
    expect(trustProxySetting(undefined)).toBe(false);
    expect(trustProxySetting('')).toBe(false);
    expect(trustProxySetting('0')).toBe(false);
  });

  it('is the number of hops when it is a small whole number', () => {
    expect(trustProxySetting('1')).toBe(1);
    expect(trustProxySetting(' 2 ')).toBe(2);
  });

  it.each(['true', 'yes', '-1', '1.5', '100', '1,2', 'loopback'])('refuses %s (never trust every hop)', (raw) => {
    expect(trustProxySetting(raw)).toBe(false);
  });
});

describe('fingerprint', () => {
  it('is stable, case and space insensitive, and not the original value', () => {
    const first = fingerprint('Guest@Example.com ');

    expect(first).toBe(fingerprint('guest@example.com'));
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(first).not.toContain('guest');
  });

  it('differs with the salt and the value', () => {
    expect(fingerprint('a', 's1')).not.toBe(fingerprint('a', 's2'));
    expect(fingerprint('a')).not.toBe(fingerprint('b'));
  });
});

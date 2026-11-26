/**
 * @file apps/api/src/shared/http/client-ip.spec.ts
 * @shared Client IP, trust proxy and fingerprint helpers
 */

import { clientIp, fingerprint, normalizeIp, trustProxySetting } from './client-ip';

describe('clientIp', () => {
  it('returns the address Express worked out', () => {
    expect(clientIp({ ip: '203.0.113.9' })).toBe('203.0.113.9');
  });

  it('is undefined with no address', () => {
    expect(clientIp({})).toBeUndefined();
    expect(clientIp({ ip: '' })).toBeUndefined();
    expect(clientIp({ ip: '   ' })).toBeUndefined();
  });

  it('keys an IPv6 client by its /64, so rotating inside the prefix is one caller (R2-13)', () => {
    expect(clientIp({ ip: '2001:db8:1:2:aaaa:bbbb:cccc:dddd' })).toBe(clientIp({ ip: '2001:db8:1:2:1::9' }));
  });
});

describe('normalizeIp', () => {
  it.each([
    ['203.0.113.9', '203.0.113.9'],
    ['127.0.0.1', '127.0.0.1'],
    ['0.0.0.0', '0.0.0.0'],
  ])('leaves IPv4 %s as it is', (raw, expected) => {
    expect(normalizeIp(raw)).toBe(expected);
  });

  it.each([
    ['2001:db8:1:2:aaaa:bbbb:cccc:dddd', '2001:db8:1:2::/64'],
    ['2001:0DB8:0001:0002:0000:0000:0000:0001', '2001:db8:1:2::/64'],
    ['2001:db8:1:2::1', '2001:db8:1:2::/64'],
    ['2001:db8::1', '2001:db8:0:0::/64'],
    ['2001:db8:0:0:ffff:ffff:ffff:ffff', '2001:db8:0:0::/64'],
    ['fe80::1', 'fe80:0:0:0::/64'],
    ['::1', '0:0:0:0::/64'],
    ['::', '0:0:0:0::/64'],
    ['[2001:db8:1:2::5]', '2001:db8:1:2::/64'],
    ['fe80::1%eth0', 'fe80:0:0:0::/64'],
  ])('maps IPv6 %s to its /64 prefix', (raw, expected) => {
    expect(normalizeIp(raw)).toBe(expected);
  });

  it('gives the same key for every address in one /64 and a different one for the next /64', () => {
    const a = normalizeIp('2a02:810d:1234:5678:1111:2222:3333:4444');
    const b = normalizeIp('2a02:810d:1234:5678:ffff:ffff:ffff:ffff');
    const next = normalizeIp('2a02:810d:1234:5679::1');

    expect(a).toBe(b);
    expect(next).not.toBe(a);
  });

  it.each([
    ['::ffff:203.0.113.9', '203.0.113.9'],
    ['::FFFF:203.0.113.9', '203.0.113.9'],
    ['::ffff:cb00:7109', '203.0.113.9'],
    ['0:0:0:0:0:ffff:127.0.0.1', '127.0.0.1'],
    ['::ffff:7f00:1', '127.0.0.1'],
  ])('turns IPv4-mapped %s into the IPv4 address, the same key as a plain IPv4 client', (raw, expected) => {
    expect(normalizeIp(raw)).toBe(expected);
  });

  it('does not treat other ::ffff-looking prefixes as mapped', () => {
    expect(normalizeIp('::fffe:203.0.113.9')).toBe('0:0:0:0::/64');
    expect(normalizeIp('1::ffff:203.0.113.9')).toBe('1:0:0:0::/64');
  });

  it('returns something that is not an IP lower-cased and bounded, never throwing', () => {
    expect(normalizeIp('Unknown-Host')).toBe('unknown-host');
    expect(normalizeIp('x'.repeat(200))).toHaveLength(64);
    expect(normalizeIp('2001:db8::g')).toBe('2001:db8::g');
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

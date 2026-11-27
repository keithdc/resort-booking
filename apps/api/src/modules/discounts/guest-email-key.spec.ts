/**
 * @file apps/api/src/modules/discounts/guest-email-key.spec.ts
 * @feature discounts
 */

import { guestEmailKey, GuestEmailKeyService, normaliseGuestEmail } from './guest-email-key';

const SALT = 'a-test-salt-of-at-least-thirty-two-characters';

describe('normaliseGuestEmail', () => {
  it('trims and lower-cases', () => {
    expect(normaliseGuestEmail('  Grace.Hopper@Example.COM \n')).toBe('grace.hopper@example.com');
  });

  it('removes the +tag from the name before the @', () => {
    expect(normaliseGuestEmail('grace+welcome@example.com')).toBe('grace@example.com');
    expect(normaliseGuestEmail('grace+a+b@example.com')).toBe('grace@example.com');
  });

  it('keeps an address whose name would be empty after the plus, so such addresses are not all one guest', () => {
    expect(normaliseGuestEmail('+deal@example.com')).toBe('+deal@example.com');
  });

  it('removes dots and reads googlemail.com as gmail.com for Gmail only', () => {
    expect(normaliseGuestEmail('Grace.Hopper+deal@GoogleMail.com')).toBe('gracehopper@gmail.com');
    expect(normaliseGuestEmail('g.r.a.c.e@gmail.com')).toBe('grace@gmail.com');
    expect(normaliseGuestEmail('grace.hopper@example.com')).toBe('grace.hopper@example.com');
    expect(normaliseGuestEmail('grace.hopper@outlook.com')).toBe('grace.hopper@outlook.com');
  });

  it('does not treat a lookalike domain as Gmail', () => {
    expect(normaliseGuestEmail('a.b@gmail.com.example.org')).toBe('a.b@gmail.com.example.org');
    expect(normaliseGuestEmail('a.b@notgmail.com')).toBe('a.b@notgmail.com');
  });

  it('uses Unicode normalisation, so a full-width or accented form compares like its plain twin', () => {
    expect(normaliseGuestEmail('ＧＲＡＣＥ@example.com')).toBe('grace@example.com');
    expect(normaliseGuestEmail('José@Example.com')).toBe('josé@example.com');
    expect(normaliseGuestEmail('José@example.com')).toBe(normaliseGuestEmail('José@example.com'));
  });

  it('returns text that is not an address trimmed and lower-cased, without throwing', () => {
    expect(normaliseGuestEmail('  NoAtSign ')).toBe('noatsign');
    expect(normaliseGuestEmail('@example.com')).toBe('@example.com');
    expect(normaliseGuestEmail('grace@')).toBe('grace@');
    expect(normaliseGuestEmail('')).toBe('');
  });
});

describe('guestEmailKey', () => {
  it('is 64 hex characters and the same for addresses that normalise alike', () => {
    const a = guestEmailKey('Grace.Hopper+x@gmail.com', SALT);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(guestEmailKey(' gracehopper@googlemail.com ', SALT)).toBe(a);
  });

  it('differs between guests and between secrets', () => {
    expect(guestEmailKey('a@example.com', SALT)).not.toBe(guestEmailKey('b@example.com', SALT));
    expect(guestEmailKey('a@example.com', SALT)).not.toBe(guestEmailKey('a@example.com', `${SALT}-other`));
  });

  it('never contains the address', () => {
    expect(guestEmailKey('grace@example.com', SALT)).not.toContain('grace');
  });
});

describe('GuestEmailKeyService', () => {
  const config = (value: string | undefined): never => ({ get: (): string | undefined => value }) as never;

  it('uses IP_HASH_SALT', () => {
    expect(new GuestEmailKeyService(config(SALT)).keyFor('a@example.com')).toBe(guestEmailKey('a@example.com', SALT));
  });

  it('refuses to start without the secret outside development', () => {
    const before = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => new GuestEmailKeyService(config(undefined))).toThrow(/IP_HASH_SALT/);
    } finally {
      process.env.NODE_ENV = before;
    }
  });
});

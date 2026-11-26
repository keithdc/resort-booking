/**
 * @file apps/api/src/modules/identity/two-factor.totp.spec.ts
 * @feature identity
 * TOTP against the RFC 6238 Appendix B test vectors (SHA-1 secret "12345678901234567890").
 */

import {
  base32Decode,
  base32Encode,
  buildOtpauthUri,
  generateTotpSecret,
  hotp,
  looksLikeTotpCode,
  matchTotp,
  safeEqual,
  timeStep,
  totpAt,
} from './two-factor.totp';

const RFC_SECRET = Buffer.from('12345678901234567890', 'ascii');

describe('TOTP', () => {
  describe('RFC 6238 vectors (8 digits, SHA-1)', () => {
    const vectors: ReadonlyArray<[number, string]> = [
      [59, '94287082'],
      [1111111109, '07081804'],
      [1111111111, '14050471'],
      [1234567890, '89005924'],
      [2000000000, '69279037'],
      [20000000000, '65353130'],
    ];

    it.each(vectors)('at unix time %i the code is %s', (seconds, expected) => {
      expect(totpAt(RFC_SECRET, seconds * 1000, 8)).toBe(expected);
    });
  });

  it('matches the RFC 4226 HOTP vectors', () => {
    const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
    expected.forEach((code, counter) => {
      expect(hotp(RFC_SECRET, counter)).toBe(code);
    });
  });

  it('shows six digits, zero-padded', () => {
    expect(totpAt(RFC_SECRET, 1111111109 * 1000)).toBe('081804');
  });

  describe('the +-1 step window', () => {
    const now = 1_700_000_000_000;
    const step = timeStep(now);

    it('accepts the current, previous and next step and says which one matched', () => {
      expect(matchTotp(RFC_SECRET, hotp(RFC_SECRET, step), now)).toBe(step);
      expect(matchTotp(RFC_SECRET, hotp(RFC_SECRET, step - 1), now)).toBe(step - 1);
      expect(matchTotp(RFC_SECRET, hotp(RFC_SECRET, step + 1), now)).toBe(step + 1);
    });

    it('rejects two steps away in either direction', () => {
      expect(matchTotp(RFC_SECRET, hotp(RFC_SECRET, step - 2), now)).toBeNull();
      expect(matchTotp(RFC_SECRET, hotp(RFC_SECRET, step + 2), now)).toBeNull();
    });

    it('ignores spaces and rejects anything that is not six digits', () => {
      const code = hotp(RFC_SECRET, step);
      expect(matchTotp(RFC_SECRET, `${code.slice(0, 3)} ${code.slice(3)}`, now)).toBe(step);
      expect(matchTotp(RFC_SECRET, '12345', now)).toBeNull();
      expect(matchTotp(RFC_SECRET, '1234567', now)).toBeNull();
      expect(matchTotp(RFC_SECRET, 'abcdef', now)).toBeNull();
      expect(matchTotp(RFC_SECRET, '', now)).toBeNull();
    });

    it('rejects a wrong code', () => {
      const wrong = hotp(RFC_SECRET, step) === '000000' ? '000001' : '000000';
      expect(matchTotp(RFC_SECRET, wrong, now)).toBeNull();
    });

    it('a code for another secret is rejected', () => {
      const other = Buffer.from('another-secret-of-20', 'ascii');
      expect(matchTotp(RFC_SECRET, hotp(other, step), now)).toBeNull();
    });
  });

  it('recognises the shape of an authenticator code', () => {
    expect(looksLikeTotpCode('123456')).toBe(true);
    expect(looksLikeTotpCode('123 456')).toBe(true);
    expect(looksLikeTotpCode('ABCDE-FGHJK')).toBe(false);
  });

  it('compares in constant time and treats different lengths as unequal', () => {
    expect(safeEqual('123456', '123456')).toBe(true);
    expect(safeEqual('123456', '123457')).toBe(false);
    expect(safeEqual('123456', '12345')).toBe(false);
  });

  describe('base32', () => {
    it('matches the RFC 4648 vectors (without padding)', () => {
      expect(base32Encode(Buffer.from('foobar', 'ascii'))).toBe('MZXW6YTBOI');
      expect(base32Encode(Buffer.from('fooba', 'ascii'))).toBe('MZXW6YTB');
      expect(base32Encode(Buffer.from('f', 'ascii'))).toBe('MY');
      expect(base32Encode(Buffer.alloc(0))).toBe('');
    });

    it('round trips random secrets and tolerates case, spaces and padding', () => {
      const secret = generateTotpSecret();
      const text = base32Encode(secret);
      expect(base32Decode(text)?.equals(secret)).toBe(true);
      expect(base32Decode(`${text.slice(0, 4).toLowerCase()} ${text.slice(4)}==`)?.equals(secret)).toBe(true);
    });

    it('rejects characters outside the alphabet', () => {
      expect(base32Decode('MZXW6!TB')).toBeNull();
      expect(base32Decode('0189')).toBeNull();
    });

    it('decodes the RFC secret from its well-known base32 form', () => {
      expect(base32Decode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ')?.equals(RFC_SECRET)).toBe(true);
    });
  });

  it('generates a fresh 160-bit secret every time', () => {
    const a = generateTotpSecret();
    expect(a).toHaveLength(20);
    expect(a.equals(generateTotpSecret())).toBe(false);
  });

  describe('otpauth URI', () => {
    it('carries the secret, issuer and the standard parameters, and escapes the label', () => {
      const uri = buildOtpauthUri('Humphreys & Sons', 'ada+x@example.com', 'MZXW6YTB');
      const url = new URL(uri);

      expect(url.protocol).toBe('otpauth:');
      expect(url.host).toBe('totp');
      expect(decodeURIComponent(url.pathname)).toBe('/Humphreys & Sons:ada+x@example.com');
      expect(url.searchParams.get('secret')).toBe('MZXW6YTB');
      expect(url.searchParams.get('issuer')).toBe('Humphreys & Sons');
      expect(url.searchParams.get('algorithm')).toBe('SHA1');
      expect(url.searchParams.get('digits')).toBe('6');
      expect(url.searchParams.get('period')).toBe('30');
      expect(uri).not.toContain(' ');
    });
  });
});

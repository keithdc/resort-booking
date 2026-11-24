/**
 * @file packages/ui/src/contact/contact-validation.test.ts
 * @shared Email and phone validation
 */

import { describe, expect, it } from 'vitest';
import {
  countryName,
  countryOptions,
  emailError,
  flagEmoji,
  formatNational,
  isValidEmail,
  isValidPhone,
  phoneError,
  splitE164,
  toE164,
} from './contact-validation';

describe('isValidEmail', () => {
  it.each(['name@example.com', 'first.last@sub.example.co.uk', 'a+tag@example.fr', ' padded@example.com '])(
    'accepts %s',
    (email) => {
      expect(isValidEmail(email)).toBe(true);
    },
  );

  it.each([
    '',
    'plain',
    'no-at.example.com',
    'two@@example.com',
    'a@b@example.com',
    '@example.com',
    'name@',
    'name@example',
    'name@example.c',
    'name@.example.com',
    'name@example..com',
    'name@-example.com',
    '.name@example.com',
    'name.@example.com',
    'na..me@example.com',
    'na me@example.com',
    'name@exam ple.com',
    'name@example.123',
  ])('rejects %j', (email) => {
    expect(isValidEmail(email)).toBe(false);
  });

  it('rejects an address that is too long', () => {
    expect(isValidEmail(`${'a'.repeat(65)}@example.com`)).toBe(false);
    expect(isValidEmail(`a@${'b'.repeat(250)}.com`)).toBe(false);
  });
});

describe('emailError', () => {
  it('asks for an address when required and empty', () => {
    expect(emailError('  ', true)).toBe('Enter an email address');
  });

  it('allows an empty optional email', () => {
    expect(emailError('', false)).toBeNull();
  });

  it('explains a malformed address and passes a good one', () => {
    expect(emailError('nope', true)).toContain('valid email');
    expect(emailError('name@example.com', true)).toBeNull();
  });
});

describe('isValidPhone', () => {
  it('accepts real international numbers', () => {
    expect(isValidPhone('+33612345678')).toBe(true);
    expect(isValidPhone('+442071838750')).toBe(true);
    expect(isValidPhone('+4930123456')).toBe(true);
  });

  it('rejects numbers that do not exist, too short numbers, and missing country code', () => {
    expect(isValidPhone('+33400000002')).toBe(false);
    expect(isValidPhone('+33')).toBe(false);
    expect(isValidPhone('+3361')).toBe(false);
    expect(isValidPhone('0612345678')).toBe(false);
    expect(isValidPhone('')).toBe(false);
    expect(isValidPhone('+33abc')).toBe(false);
  });
});

describe('phoneError', () => {
  it('asks for a number when required and empty, and allows an empty optional one', () => {
    expect(phoneError('', true, 'France')).toBe('Enter a phone number');
    expect(phoneError('', false, 'France')).toBeNull();
  });

  it('names the country for an invalid number', () => {
    expect(phoneError('+33400000002', true, 'France')).toBe('Enter a valid phone number for France');
    expect(phoneError('+33612345678', true, 'France')).toBeNull();
  });
});

describe('country helpers', () => {
  it('builds a flag emoji from a country code', () => {
    expect(flagEmoji('FR')).toBe('🇫🇷');
    expect(flagEmoji('de')).toBe('🇩🇪');
  });

  it('lists countries with calling codes, sorted by name', () => {
    const options = countryOptions();
    const france = options.find((option) => option.code === 'FR');
    expect(france).toMatchObject({ name: 'France', callingCode: '33', flag: '🇫🇷' });
    expect(options.find((option) => option.code === 'GB')?.callingCode).toBe('44');
    const names = options.map((option) => option.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));
    expect(options.length).toBeGreaterThan(200);
  });

  it('names a country', () => {
    expect(countryName('DE')).toBe('Germany');
  });
});

describe('toE164', () => {
  it('converts a national number with a leading zero', () => {
    expect(toE164('FR', '06 12 34 56 78')).toBe('+33612345678');
  });

  it('converts a number typed without formatting', () => {
    expect(toE164('FR', '612345678')).toBe('+33612345678');
  });

  it('keeps the leading zero of an Italian landline, which is part of the number', () => {
    expect(toE164('IT', '06 12345678')).toBe('+390612345678');
  });

  it('keeps an international number as typed, whatever the selected country', () => {
    expect(toE164('FR', '+49 30 123456')).toBe('+4930123456');
  });

  it('keeps an incomplete number with its country prefix so nothing typed is lost', () => {
    expect(toE164('FR', '06 12')).toBe('+33612');
  });

  it('returns empty when there are no digits', () => {
    expect(toE164('FR', '')).toBe('');
    expect(toE164('FR', ' - ')).toBe('');
  });
});

describe('formatNational and splitE164', () => {
  it('formats digits as the guest types', () => {
    expect(formatNational('FR', '0612345678')).toBe('06 12 34 56 78');
  });

  it('splits a stored number into country and national text', () => {
    expect(splitE164('+33612345678')).toEqual({ country: 'FR', national: '06 12 34 56 78' });
    expect(splitE164('+4930123456')?.country).toBe('DE');
  });

  it('returns null for empty or unreadable values', () => {
    expect(splitE164('')).toBeNull();
    expect(splitE164('not a number')).toBeNull();
  });
});

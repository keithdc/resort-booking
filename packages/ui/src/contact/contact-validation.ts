/**
 * @file packages/ui/src/contact/contact-validation.ts
 * @shared Email and phone validation for guest and admin forms
 * @dependencies libphonenumber-js (max metadata, the same data the API's @IsPhoneNumber uses)
 */

import {
  AsYouType,
  getCountries,
  getCountryCallingCode,
  isValidPhoneNumber,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/max';

export type { CountryCode };

export const DEFAULT_PHONE_COUNTRY: CountryCode = 'FR';

const EMAIL_LOCAL = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/;
const EMAIL_DOMAIN_LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const MAX_EMAIL_LENGTH = 254;
const MAX_EMAIL_LOCAL_LENGTH = 64;

/**
 * Pragmatic email check: one @, a sane local part, dotted domain, alphabetic TLD of 2+ letters.
 * The API stays the final judge; this catches typos before the guest submits.
 */
export function isValidEmail(value: string): boolean {
  const email = value.trim();
  if (email === '' || email.length > MAX_EMAIL_LENGTH) {
    return false;
  }
  const parts = email.split('@');
  if (parts.length !== 2) {
    return false;
  }
  const [local, domain] = parts;
  if (local === undefined || domain === undefined) {
    return false;
  }
  if (local.length === 0 || local.length > MAX_EMAIL_LOCAL_LENGTH || !EMAIL_LOCAL.test(local)) {
    return false;
  }
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
    return false;
  }
  const labels = domain.split('.');
  const tld = labels[labels.length - 1] ?? '';
  return labels.length >= 2 && labels.every((label): boolean => EMAIL_DOMAIN_LABEL.test(label)) && /^[A-Za-z]{2,}$/.test(tld);
}

/**
 * Message for the email field, or null when fine. An empty optional email is fine.
 */
export function emailError(value: string, required: boolean): string | null {
  if (value.trim() === '') {
    return required ? 'Enter an email address' : null;
  }
  return isValidEmail(value) ? null : 'Enter a valid email address, like name@example.com';
}

/**
 * True for an international number (+ and country code) that really exists.
 */
export function isValidPhone(e164: string): boolean {
  return e164.startsWith('+') && isValidPhoneNumber(e164);
}

/**
 * Message for the phone field, or null when fine. An empty optional phone is fine.
 */
export function phoneError(e164: string, required: boolean): string | null {
  if (e164.trim() === '') {
    return required ? 'Enter a phone number' : null;
  }
  return isValidPhone(e164) ? null : 'Enter a valid phone number';
}

export interface CountryOption {
  code: CountryCode;
  name: string;
  callingCode: string;
  flag: string;
}

/**
 * Flag emoji from a two-letter country code (regional indicator symbols).
 */
export function flagEmoji(code: string): string {
  return String.fromCodePoint(...[...code.toUpperCase()].map((letter): number => 127397 + letter.charCodeAt(0)));
}

/**
 * Every country with its calling code and flag, sorted by name.
 */
export function countryOptions(locale = 'en'): CountryOption[] {
  const names = new Intl.DisplayNames([locale], { type: 'region' });
  return getCountries()
    .map((code): CountryOption => ({
      code,
      name: names.of(code) ?? code,
      callingCode: getCountryCallingCode(code),
      flag: flagEmoji(code),
    }))
    .sort((a, b): number => a.name.localeCompare(b.name, locale));
}

/**
 * Display name of a country, falling back to its code.
 */
export function countryName(code: CountryCode, locale = 'en'): string {
  return new Intl.DisplayNames([locale], { type: 'region' }).of(code) ?? code;
}

/**
 * National text the guest typed + chosen country -> E.164 ("06 12 34 56 78", FR -> "+33612345678").
 * Empty digits give an empty string. An incomplete number still gets the country prefix so the
 * parent keeps what was typed; validity is checked separately.
 */
export function toE164(country: CountryCode, text: string): string {
  const digits = text.replace(/\D/g, '');
  if (digits === '') {
    return '';
  }
  const parsed = parsePhoneNumberFromString(text, country);
  // Trust the library only for a complete valid number. For a half-typed one it can keep the
  // national "0" inside the number ("+330612"), so apply one consistent rule instead.
  if (parsed?.isValid() === true) {
    return parsed.number;
  }
  return `+${getCountryCallingCode(country)}${digits.replace(/^0+/, '')}`;
}

/**
 * Formats national digits as the guest types, for the chosen country.
 */
export function formatNational(country: CountryCode, text: string): string {
  return new AsYouType(country).input(text);
}

export interface SplitPhone {
  country: CountryCode | undefined;
  national: string;
}

/**
 * Splits a stored E.164 value into country and a formatted national part, for pre-filling.
 */
export function splitE164(value: string): SplitPhone | null {
  const parsed = value === '' ? undefined : parsePhoneNumberFromString(value);
  if (parsed === undefined) {
    return null;
  }
  return { country: parsed.country, national: parsed.formatNational() };
}

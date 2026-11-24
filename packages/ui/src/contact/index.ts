/**
 * @file packages/ui/src/contact/index.ts
 * @shared Contact-detail fields and validation: import from "@resort-booking/ui/contact"
 * @dependencies libphonenumber-js (heavy: kept out of the main barrel on purpose)
 */

export { EmailField } from './email-field';
export type { EmailFieldProps } from './email-field';
export { PhoneField } from './phone-field';
export type { PhoneFieldProps } from './phone-field';
export { emailError, isValidEmail, isValidPhone, phoneError } from './contact-validation';
export type { CountryCode } from './contact-validation';

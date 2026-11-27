/**
 * @file apps/admin/src/features/configuration/utils/form-dirty.ts
 * @feature configuration
 * @dependencies none
 */

/**
 * True when any field of a flat form differs from where it started (so Save can wait for a real change).
 */
export function isFormDirty<T extends object>(initial: T, current: T): boolean {
  return (Object.keys(initial) as Array<keyof T>).some((key): boolean => initial[key] !== current[key]);
}

/**
 * Why the contact part of the organisation form cannot be saved yet, or null when it can.
 * The API checks everything again; this only explains the disabled button.
 */
export function organizationProblem(checks: {
  emailsValid: boolean;
  phoneValid: boolean;
}): string | null {
  if (!checks.emailsValid) {
    return 'Enter a valid address in each email field to save.';
  }
  if (!checks.phoneValid) {
    return 'The ops phone number is not valid yet.';
  }
  return null;
}

/** Where money or guest mail goes: changing one of these needs the current password (docs/13 R6-06). */
const SENSITIVE_FIELDS = ['iban', 'bic', 'bankAccountName', 'contactEmail', 'bookingEmail', 'guestReplyEmail'] as const;

function normalisedSensitive(name: (typeof SENSITIVE_FIELDS)[number], value: string): string {
  const trimmed = value.trim();
  if (name === 'iban' || name === 'bic') {
    return trimmed.replace(/\s+/g, '').toUpperCase();
  }
  if (name === 'bankAccountName') {
    return trimmed;
  }
  return trimmed.toLowerCase();
}

/**
 * True when the form changes the bank details or an email address, compared the way the API compares them (an IBAN in
 * other spacing or case is the same IBAN). The API asks for the password in exactly these cases.
 */
export function changesSensitiveFields<T extends Record<(typeof SENSITIVE_FIELDS)[number], string>>(saved: T, form: T): boolean {
  return SENSITIVE_FIELDS.some((name): boolean => normalisedSensitive(name, saved[name]) !== normalisedSensitive(name, form[name]));
}

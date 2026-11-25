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

/**
 * The password rule shown under the field: at least 8 characters with a letter and a number.
 */
export function passwordProblem(password: string): string | null {
  if (password === '') {
    return null;
  }
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'At least 8 characters, with a letter and a number.';
  }
  return null;
}

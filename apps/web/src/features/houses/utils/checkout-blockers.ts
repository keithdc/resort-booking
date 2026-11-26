/**
 * @file apps/web/src/features/houses/utils/checkout-blockers.ts
 * @feature houses
 * @dependencies none — wording only; the API still validates everything
 */

export interface CheckoutBlockerInput {
  pending: boolean;
  datesFree: boolean;
  overMaxNights: boolean;
  nameFilled: boolean;
  emailValid: boolean;
  phoneValid: boolean;
  termsAccepted: boolean;
}

/**
 * What is still missing before Pay can be pressed, in the order the form asks for it. Powers the
 * line under a disabled Pay button, so a guest on a phone (where the button can be off-screen
 * from the field that is wrong) is told what to fix. Empty means nothing is missing.
 */
export function checkoutBlockers(input: CheckoutBlockerInput): string[] {
  const missing: string[] = [];
  if (!input.datesFree || input.overMaxNights) {
    missing.push('choose dates that are free');
  }
  if (!input.nameFilled) {
    missing.push('enter your name');
  }
  if (!input.emailValid) {
    missing.push('enter a valid email');
  }
  if (!input.phoneValid) {
    missing.push('enter a valid phone number');
  }
  if (!input.termsAccepted) {
    missing.push('accept the cancellation terms');
  }
  return input.pending ? [] : missing;
}

/**
 * "To continue: enter your name, enter a valid email and accept the cancellation terms."
 * Empty string when nothing is missing.
 */
export function describeCheckoutBlockers(missing: readonly string[]): string {
  if (missing.length === 0) {
    return '';
  }
  const head = missing.slice(0, -1);
  const last = missing[missing.length - 1] ?? '';
  const list = head.length === 0 ? last : `${head.join(', ')} and ${last}`;
  return `To continue: ${list}.`;
}

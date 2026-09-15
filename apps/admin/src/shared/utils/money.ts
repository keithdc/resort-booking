/**
 * @file apps/admin/src/shared/utils/money.ts
 * @shared Display-only currency formatting
 * @dependencies none
 */

/**
 * Formats API minor units. Does not compute revenue.
 */
export function formatCents(cents: number, currencyCode: string): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: currencyCode,
  }).format(cents / 100);
}

/**
 * Euro amount string for staff editors (15000 cents → "150").
 */
export function eurosInputFromCents(cents: number): string {
  const value = cents / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

/**
 * Parses a euro field into cents.
 */
export function centsFromEuroInput(value: string): number {
  const parsed = Number.parseFloat(value.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.round(parsed * 100);
}

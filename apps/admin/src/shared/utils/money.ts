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

/**
 * Strict euro field -> cents: "12", "12.5", "12,50" are fine; blank, negative, text or more than
 * two decimals give null so a form can say what is wrong instead of silently using 0.
 */
export function parseEurosToCents(value: string): number | null {
  const text = value.trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    return null;
  }
  return Math.round(Number.parseFloat(text) * 100);
}

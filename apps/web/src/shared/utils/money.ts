/**
 * @file apps/web/src/shared/utils/money.ts
 * @shared Display-only currency formatting
 * @dependencies none
 */

/**
 * Formats API minor units for the guest UI. Does not compute quotes.
 */
export function formatCents(cents: number, currencyCode: string): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: currencyCode,
  }).format(cents / 100);
}

/**
 * @file apps/web/src/shared/utils/money.ts
 * @shared Display-only currency formatting
 * @dependencies none
 */

/**
 * Formats API minor units for the guest UI. Does not compute quotes.
 */
export function formatCents(cents: number, currencyCode: string): string {
  if (!Number.isFinite(cents)) {
    return '—';
  }
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currencyCode,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currencyCode}`;
  }
}

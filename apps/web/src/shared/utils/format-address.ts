/**
 * @file apps/web/src/shared/utils/format-address.ts
 * @shared Guest address line for listings
 * @dependencies none
 */

/**
 * Street, postcode, town for guest cards and maps.
 */
export function formatAddress(
  addressLine: string,
  postalCode: string,
  city: string,
  countryCode?: string,
): string {
  const street = [addressLine, postalCode, city].filter((part): boolean => part.trim() !== '').join(', ');
  if (countryCode === undefined || countryCode === '') {
    return street;
  }
  return `${street} · ${countryCode}`;
}

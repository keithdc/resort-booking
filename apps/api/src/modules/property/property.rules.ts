/**
 * @file apps/api/src/modules/property/property.rules.ts
 * @feature property
 * @dependencies none
 */

/**
 * URL slug from a property name. Uniqueness is enforced in Postgres.
 */
export function slugifyPropertyName(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug === '' ? 'property' : slug;
}

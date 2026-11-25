/**
 * @file apps/admin/src/shared/components/nav-match.ts
 * @shared Which sidebar item is the current page
 * @dependencies none
 */

/**
 * The calendar is exactly "/"; every other item owns its path and everything under it
 * ("/properties/abc" belongs to Properties, "/refunds" does not belong to "/reports").
 */
export function isNavActive(href: string, pathname: string): boolean {
  if (href === '/') {
    return pathname === '/';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * @file apps/web/src/app/properties/page.tsx
 * @feature property
 * @dependencies PropertiesPage
 */

import { PropertiesPage } from '@/features/property';

export const dynamic = 'force-dynamic';

/**
 * Properties route (the list of every published property).
 */
export default function PropertiesRoute(): Promise<React.JSX.Element> {
  return PropertiesPage();
}

/**
 * @file apps/admin/src/app/properties/page.tsx
 * @feature property
 * @dependencies StaffPropertiesPage
 */

import { StaffPropertiesPage } from '@/features/property';

export const dynamic = 'force-dynamic';

/**
 * Properties route.
 */
export default async function PropertiesRoute(): Promise<React.JSX.Element> {
  return <StaffPropertiesPage />;
}

/**
 * @file apps/admin/src/app/properties/page.tsx
 * @feature property
 * @dependencies StaffPropertiesPage, AdminOnly
 */

import { StaffPropertiesPage } from '@/features/property';
import { AdminOnly } from '@/shared/components/admin-only';

export const dynamic = 'force-dynamic';

/**
 * Properties route (admins only: employees work from the calendar).
 */
export default async function PropertiesRoute(): Promise<React.JSX.Element> {
  return (
    <AdminOnly what="Property setup">
      <StaffPropertiesPage />
    </AdminOnly>
  );
}

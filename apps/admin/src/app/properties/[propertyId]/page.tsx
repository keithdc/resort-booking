/**
 * @file apps/admin/src/app/properties/[propertyId]/page.tsx
 * @feature property
 * @dependencies PropertyWorkspacePage, AdminOnly
 */

import { PropertyWorkspacePage } from '@/features/property';
import { AdminOnly } from '@/shared/components/admin-only';

export const dynamic = 'force-dynamic';

interface PropertyRouteProps {
  params: Promise<{ propertyId: string }>;
}

/**
 * Per-property configuration (admins only).
 */
export default async function PropertyRoute({ params }: PropertyRouteProps): Promise<React.JSX.Element> {
  const { propertyId } = await params;
  return (
    <AdminOnly what="Property setup">
      <PropertyWorkspacePage propertyId={propertyId} />
    </AdminOnly>
  );
}

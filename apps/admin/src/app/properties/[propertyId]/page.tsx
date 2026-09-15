/**
 * @file apps/admin/src/app/properties/[propertyId]/page.tsx
 * @feature property
 * @dependencies PropertyWorkspacePage
 */

import { PropertyWorkspacePage } from '@/features/property';

export const dynamic = 'force-dynamic';

interface PropertyRouteProps {
  params: Promise<{ propertyId: string }>;
}

/**
 * Per-property configuration.
 */
export default async function PropertyRoute({ params }: PropertyRouteProps): Promise<React.JSX.Element> {
  const { propertyId } = await params;
  return <PropertyWorkspacePage propertyId={propertyId} />;
}

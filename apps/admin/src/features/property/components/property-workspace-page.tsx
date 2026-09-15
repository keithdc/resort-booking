/**
 * @file apps/admin/src/features/property/components/property-workspace-page.tsx
 * @feature property
 * @dependencies staff APIs
 */

import {
  fetchPropertyBookingConfig,
  fetchPropertyExtras,
  fetchPropertyRequestOptions,
  fetchStaffHouses,
  fetchStaffProperty,
} from '../services/staff-property-api';
import { PropertyWorkspace } from './property-workspace';

interface PropertyWorkspacePageProps {
  propertyId: string;
}

/**
 * Loads one property's listing, refunds, extras, and houses.
 */
export async function PropertyWorkspacePage({
  propertyId,
}: PropertyWorkspacePageProps): Promise<React.JSX.Element> {
  const [property, houses, config, extras, requestOptions] = await Promise.all([
    fetchStaffProperty(propertyId),
    fetchStaffHouses(propertyId),
    fetchPropertyBookingConfig(propertyId),
    fetchPropertyExtras(propertyId),
    fetchPropertyRequestOptions(propertyId),
  ]);
  return (
    <PropertyWorkspace
      property={property}
      houses={houses}
      config={config}
      extras={extras}
      requestOptions={requestOptions}
    />
  );
}

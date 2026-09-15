/**
 * @file apps/admin/src/features/property/services/staff-property-api.ts
 * @feature property
 * @dependencies api-client
 */

import type {
  CreatePropertyRequest,
  ExtraService,
  ExtraServiceWrite,
  GeocodeHit,
  HouseDetail,
  HouseRequestOption,
  HouseRequestOptionWrite,
  HouseSummary,
  HouseWrite,
  OrganizationSettings,
  PropertyBookingConfig,
  PropertyDetail,
  PropertySummary,
  SavePropertyBookingConfigRequest,
  UpdateOrganizationSettingsRequest,
  UpdatePropertyRequest,
} from '@resort-booking/shared-types';
import { getStaffApiOk, mutateStaffApiOk } from '@/shared/services/api-client';

/**
 * Staff property list including unpublished.
 */
export function fetchStaffProperties(): Promise<PropertySummary[]> {
  return getStaffApiOk<PropertySummary[]>('/staff/properties');
}

/**
 * One property for the editor.
 */
export function fetchStaffProperty(propertyId: string): Promise<PropertyDetail> {
  return getStaffApiOk<PropertyDetail>(`/staff/properties/${propertyId}`);
}

/**
 * Houses at that property.
 */
export function fetchStaffHouses(propertyId: string): Promise<HouseSummary[]> {
  return getStaffApiOk<HouseSummary[]>(`/staff/properties/${propertyId}/houses`);
}

/**
 * Nominatim search proxied by Nest for listing pins.
 */
export function searchStaffAddresses(query: string): Promise<GeocodeHit[]> {
  return getStaffApiOk<GeocodeHit[]>(`/staff/geocode?q=${encodeURIComponent(query)}`);
}

/**
 * OSM reverse lookup after staff drop a pin.
 */
export function reverseStaffGeocode(latitude: number, longitude: number): Promise<GeocodeHit | null> {
  const params = new URLSearchParams({
    lat: String(latitude),
    lon: String(longitude),
  });
  return getStaffApiOk<GeocodeHit | null>(`/staff/geocode/reverse?${params.toString()}`);
}

/**
 * One house including amenities.
 */
export function fetchStaffHouse(houseId: string): Promise<HouseDetail> {
  return getStaffApiOk<HouseDetail>(`/staff/houses/${houseId}`);
}

/**
 * Adds a house under a property.
 */
export function createStaffHouse(propertyId: string, body: HouseWrite): Promise<HouseDetail> {
  return mutateStaffApiOk<HouseDetail>(`/staff/properties/${propertyId}/houses`, 'POST', body);
}

/**
 * Saves house listing + amenities.
 */
export function updateStaffHouse(houseId: string, body: HouseWrite): Promise<HouseDetail> {
  return mutateStaffApiOk<HouseDetail>(`/staff/houses/${houseId}`, 'PATCH', body);
}

/**
 * Guest request checkboxes (pillows, mattress, …).
 */
export function fetchPropertyRequestOptions(propertyId: string): Promise<HouseRequestOption[]> {
  return getStaffApiOk<HouseRequestOption[]>(`/staff/properties/${propertyId}/request-options`);
}

/**
 * Adds a request option on this property.
 */
export function createRequestOption(
  propertyId: string,
  body: HouseRequestOptionWrite,
): Promise<HouseRequestOption> {
  return mutateStaffApiOk<HouseRequestOption>(
    `/staff/properties/${propertyId}/request-options`,
    'POST',
    body,
  );
}

/**
 * Updates a request option.
 */
export function updateRequestOption(
  optionId: string,
  body: HouseRequestOptionWrite,
): Promise<HouseRequestOption> {
  return mutateStaffApiOk<HouseRequestOption>(`/staff/request-options/${optionId}`, 'PATCH', body);
}

/**
 * Removes a request option.
 */
export function deleteRequestOption(optionId: string): Promise<{ deleted: true }> {
  return mutateStaffApiOk<{ deleted: true }>(`/staff/request-options/${optionId}`, 'DELETE');
}

/**
 * Creates an unpublished property with a seeded refund ladder.
 */
export function createStaffProperty(body: CreatePropertyRequest): Promise<PropertyDetail> {
  return mutateStaffApiOk<PropertyDetail>('/staff/properties', 'POST', body);
}

/**
 * Saves listing fields.
 */
export function updateStaffProperty(propertyId: string, body: UpdatePropertyRequest): Promise<PropertyDetail> {
  return mutateStaffApiOk<PropertyDetail>(`/staff/properties/${propertyId}`, 'PATCH', body);
}

/**
 * Per-property refund + rebook settings.
 */
export function fetchPropertyBookingConfig(propertyId: string): Promise<PropertyBookingConfig> {
  return getStaffApiOk<PropertyBookingConfig>(`/staff/properties/${propertyId}/configuration`);
}

/**
 * Replaces that property's ladder.
 */
export function savePropertyBookingConfig(
  propertyId: string,
  body: SavePropertyBookingConfigRequest,
): Promise<{ config: PropertyBookingConfig; invertedWarning: boolean }> {
  return mutateStaffApiOk(`/staff/properties/${propertyId}/configuration`, 'PUT', body);
}

/**
 * Extra services catalog for one property.
 */
export function fetchPropertyExtras(propertyId: string): Promise<ExtraService[]> {
  return getStaffApiOk<ExtraService[]>(`/staff/properties/${propertyId}/extras`);
}

/**
 * Adds an extra on this property only.
 */
export function createPropertyExtra(propertyId: string, body: ExtraServiceWrite): Promise<ExtraService> {
  return mutateStaffApiOk<ExtraService>(`/staff/properties/${propertyId}/extras`, 'POST', body);
}

/**
 * Updates an extra.
 */
export function updatePropertyExtra(extraId: string, body: ExtraServiceWrite): Promise<ExtraService> {
  return mutateStaffApiOk<ExtraService>(`/staff/extras/${extraId}`, 'PATCH', body);
}

/**
 * Removes an extra from the catalog.
 */
export function deletePropertyExtra(extraId: string): Promise<{ deleted: true }> {
  return mutateStaffApiOk<{ deleted: true }>(`/staff/extras/${extraId}`, 'DELETE');
}

/**
 * Org-wide bank and legal identity.
 */
export function fetchOrganizationSettings(): Promise<OrganizationSettings> {
  return getStaffApiOk<OrganizationSettings>('/staff/organization');
}

/**
 * Saves org-wide settings.
 */
export function saveOrganizationSettings(
  body: UpdateOrganizationSettingsRequest,
): Promise<OrganizationSettings> {
  return mutateStaffApiOk<OrganizationSettings>('/staff/organization', 'PATCH', body);
}

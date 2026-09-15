/**
 * @file packages/shared-types/src/index.ts
 * @shared Cross-app domain contracts (web, admin, api)
 * @dependencies none
 */

export type PaymentMethod = 'card' | 'bank_transfer';
export type HoldStatus = 'active' | 'expired' | 'released' | 'confirmed' | 'cancelled';
export type InventoryKind = 'hold' | 'reservation' | 'block';

export interface Organization {
  id: string;
  name: string;
}

export interface OrganizationSettings {
  id: string;
  name: string;
  legalName: string;
  legalAddress: string;
  vatNumber: string;
  iban: string;
  bic: string;
  bankAccountName: string;
  contactEmail: string;
  contactPhone: string;
  ownerName: string;
  bookingEmail: string;
  guestReplyEmail: string;
}

export interface UpdateOrganizationSettingsRequest {
  name: string;
  legalName: string;
  legalAddress: string;
  vatNumber: string;
  iban: string;
  bic: string;
  bankAccountName: string;
  contactEmail: string;
  contactPhone: string;
  ownerName: string;
  bookingEmail: string;
  guestReplyEmail: string;
}

export interface StaffProfile {
  id: string;
  organizationId: string;
  fullName: string;
  email: string;
}

export interface StaffLoginRequest {
  email: string;
  password: string;
}

export interface StaffLoginResult {
  token: string;
  expiresAt: string;
  staff: StaffProfile;
}

export interface UpdateStaffProfileRequest {
  fullName: string;
  email: string;
}

export interface ChangeStaffPasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export type ExtraServiceKind = 'instant' | 'on_request';

export interface ExtraService {
  id: string;
  organizationId: string;
  propertyId: string;
  name: string;
  description: string;
  kind: ExtraServiceKind;
  priceCents: number;
  currencyCode: string;
  published: boolean;
}

export interface ExtraServiceWrite {
  name: string;
  description: string;
  kind: ExtraServiceKind;
  priceCents: number;
  currencyCode: string;
  published: boolean;
}

export interface CreatePropertyRequest {
  name: string;
  slug: string;
  description: string;
  addressLine: string;
  city: string;
  countryCode: string;
  postalCode: string;
  latitude: number;
  longitude: number;
  phone: string;
  email: string;
  timezone: string;
  published: boolean;
  customRequestsEnabled: boolean;
  photos: PhotoWrite[];
}

export interface UpdatePropertyRequest extends CreatePropertyRequest {}

export interface CancellationTierWrite {
  minDaysBeforeCheckIn: number;
  refundPercent: number;
}

export interface SavePropertyBookingConfigRequest {
  rebookable: boolean;
  rebookFeeType: RebookFeeType;
  rebookFeeValue: number;
  tiers: CancellationTierWrite[];
}

export interface Photo {
  id: string;
  url: string;
  altText: string;
  sortOrder: number;
}

export interface PhotoWrite {
  url: string;
  altText: string;
}

export interface PropertySummary {
  id: string;
  organizationId: string;
  slug: string;
  name: string;
  description: string;
  city: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  phone: string;
  email: string;
  published: boolean;
  timezone: string;
  coverPhotoUrl: string | null;
  customRequestsEnabled: boolean;
  addressLine: string;
  postalCode: string;
}

export interface PropertyDetail extends PropertySummary {
  photos: Photo[];
}

export interface HouseSummary {
  id: string;
  organizationId: string;
  propertyId: string;
  propertySlug: string;
  propertyName: string;
  propertyCity: string;
  propertyCountryCode: string;
  propertyTimezone: string;
  propertyAddressLine: string;
  propertyPostalCode: string;
  slug: string;
  name: string;
  description: string;
  capacity: number;
  published: boolean;
  nightlyRateCents: number;
  currencyCode: string;
  coverPhotoUrl: string | null;
}

export interface HouseAmenity {
  id: string;
  houseId: string;
  name: string;
  details: string;
}

export interface HouseAmenityWrite {
  name: string;
  details: string;
}

export interface HouseRequestOption {
  id: string;
  organizationId: string;
  propertyId: string;
  name: string;
  description: string;
  published: boolean;
}

export interface HouseRequestOptionWrite {
  name: string;
  description: string;
  published: boolean;
}

export interface HouseWrite {
  name: string;
  slug: string;
  description: string;
  capacity: number;
  nightlyRateCents: number;
  currencyCode: string;
  published: boolean;
  amenities: HouseAmenityWrite[];
  photos: PhotoWrite[];
}

export interface HouseDetail extends HouseSummary {
  latitude: number | null;
  longitude: number | null;
  photos: Photo[];
  amenities: HouseAmenity[];
  propertyPhone: string;
  propertyEmail: string;
  propertyLatitude: number;
  propertyLongitude: number;
}

export interface GeocodeHit {
  label: string;
  addressLine: string;
  city: string;
  postalCode: string;
  countryCode: string;
  latitude: number;
  longitude: number;
}

export interface HouseSearchResult {
  house: HouseSummary;
  quote: Quote;
}

export interface QuoteRequest {
  houseId: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
}

export interface Quote {
  houseId: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  nights: number;
  nightlyRateCents: number;
  totalCents: number;
  currencyCode: string;
  available: boolean;
}

export interface CreateHoldRequest {
  houseId: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  paymentMethod: PaymentMethod;
  bookerName: string;
  bookerEmail: string;
  bookerPhone: string;
  guestNote: string;
  requestOptionIds: string[];
}

export interface Hold {
  id: string;
  houseId: string;
  propertyId: string;
  organizationId: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  paymentMethod: PaymentMethod;
  status: HoldStatus;
  expiresAt: string;
  warningAt: string;
  holdTtlSeconds: number;
  bookerName: string;
  bookerEmail: string;
  bookerPhone: string;
  guestNote: string;
  quote: Quote;
}

export interface ApiErrorBody {
  status: 'error';
  message: string;
  code?: string;
}

export interface ApiOkBody<T> {
  status: 'ok';
  data: T;
}

export interface HealthStatus {
  ok: boolean;
  postgres: boolean;
  redis: boolean;
}

export type RebookFeeType = 'none' | 'fixed' | 'percent';

export interface StaffReservation {
  id: string;
  organizationId: string;
  propertyId: string;
  propertyName: string;
  houseId: string;
  houseName: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  bookerName: string;
  bookerEmail: string;
  bookerPhone: string;
  guestNote: string;
  paymentMethod: PaymentMethod | null;
  status: HoldStatus;
  kind: InventoryKind;
  rebookOfId: string | null;
  totalCents: number;
  currencyCode: string;
  requestNames: string[];
}

export interface CalendarDayOccupancy {
  date: string;
  bookingCount: number;
  rebookCount: number;
  cancelledCount: number;
  pendingCount: number;
}

export interface StaffCalendar {
  from: string;
  to: string;
  days: CalendarDayOccupancy[];
}

export interface CancellationTier {
  id: string;
  propertyId: string;
  minDaysBeforeCheckIn: number;
  refundPercent: number;
}

export interface PropertyBookingConfig {
  propertyId: string;
  propertyName: string;
  rebookable: boolean;
  rebookFeeType: RebookFeeType;
  rebookFeeValue: number;
  tiers: CancellationTier[];
}

export interface HouseReportRow {
  houseId: string;
  houseName: string;
  reservationCount: number;
  occupiedNights: number;
  revenueCents: number;
}

export interface PropertyReportRow {
  propertyId: string;
  propertyName: string;
  reservationCount: number;
  occupiedNights: number;
  revenueCents: number;
  currencyCode: string;
  houses: HouseReportRow[];
}

export interface ReportSeriesPoint {
  date: string;
  revenueCents: number;
  occupiedNights: number;
  stayCount: number;
  pendingCount: number;
  cancelledCount: number;
}

export interface PaymentMethodSlice {
  paymentMethod: PaymentMethod | 'unknown';
  reservationCount: number;
  revenueCents: number;
}

export interface StaffReport {
  from: string;
  to: string;
  propertyId: string | null;
  currencyCode: string;
  houseCount: number;
  availableNights: number;
  reservationCount: number;
  occupiedNights: number;
  revenueCents: number;
  averageNightlyCents: number;
  occupancyPercent: number;
  upcomingStayCount: number;
  inHouseStayCount: number;
  guestCount: number;
  propertyBookedCount: number;
  pendingPaymentCount: number;
  cancelledCount: number;
  rebookCount: number;
  expiredHoldCount: number;
  pipeline: StaffReservation[];
  properties: PropertyReportRow[];
  daily: ReportSeriesPoint[];
  paymentMethods: PaymentMethodSlice[];
  stays: StaffReservation[];
}

/**
 * @file packages/shared-types/src/index.ts
 * @shared Cross-app domain contracts (web, admin, api)
 * @dependencies none
 */

export type PaymentMethod = 'card' | 'bank_transfer';
export type HoldStatus = 'active' | 'expired' | 'released' | 'confirmed' | 'cancelled';
export type InventoryKind = 'hold' | 'reservation' | 'block';
export type ArrivalStatus = 'expected' | 'checked_in' | 'checked_out';

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
  /** Where to pin this stay on a map: its own coordinates, else the property's. Never half and half. */
  mapLatitude: number;
  mapLongitude: number;
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

/** One priced group of nights on a quote, e.g. "Peak summer 2027": 3 nights x 26000. */
export interface QuoteLine {
  label: string;
  nights: number;
  nightlyRateCents: number;
  subtotalCents: number;
}

export interface Quote {
  houseId: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  nights: number;
  /** The house standard rate. Individual nights can cost more or less; see `lines`. */
  nightlyRateCents: number;
  /** Priced nights grouped by rate. Sum of the line subtotals equals `subtotalCents`. */
  lines: QuoteLine[];
  /** Sum of the nights before any discount. */
  subtotalCents: number;
  /** Discounts that applied, each its own line. Empty when none. */
  discounts: QuoteDiscountLine[];
  /** Sum of the discount lines. `totalCents` = `subtotalCents` - `discountCents`. */
  discountCents: number;
  totalCents: number;
  currencyCode: string;
  available: boolean;
  /** What happened to the promo code the guest typed. Null when none was sent. */
  promoCode: PromoCodeResult | null;
}

/** One applied discount on a quote. */
export interface QuoteDiscountLine {
  discountId: string;
  label: string;
  amountCents: number;
}

/** Outcome of a typed promo code. A bad code never blocks a booking. */
export interface PromoCodeResult {
  code: string;
  applied: boolean;
  message: string;
}

/** Half-open night range [startDate, endDate): endDate is the check-out day. */
export interface DateRange {
  startDate: string;
  endDate: string;
}

/** Guest-safe unavailable dates for one house. Dates only, never guest data. */
export interface HouseAvailability {
  houseId: string;
  from: string;
  to: string;
  unavailable: DateRange[];
  /** Latest valid check-out for the requested check-in. Null when no check-in was sent. */
  maxCheckOutDate: string | null;
}

/** Nights when no published house at the property is free. */
export interface PropertyAvailability {
  propertyId: string;
  from: string;
  to: string;
  fullyBookedNights: DateRange[];
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
  /** The guest ticked "I have read the cancellation terms". Must be true; the API refuses a hold without it. */
  termsAccepted: boolean;
  /** A promo code the guest typed. Optional; a bad code never blocks the booking. */
  promoCode?: string;
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
  arrivalStatus: ArrivalStatus;
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
  asOfDate: string;
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

/** A date range with its own nightly rate on one house (peak season, holidays, ...). */
export interface RatePeriod {
  id: string;
  houseId: string;
  propertyId: string;
  label: string;
  /** First night, inclusive, YYYY-MM-DD. */
  startDate: string;
  /** Last night, inclusive, YYYY-MM-DD. */
  endDate: string;
  nightlyRateCents: number;
}

export interface RatePeriodWrite {
  label: string;
  startDate: string;
  endDate: string;
  nightlyRateCents: number;
}

/** The period another one collides with, named so staff can fix it. */
export interface RatePeriodConflict {
  label: string;
  startDate: string;
  endDate: string;
}

export interface BulkRatePeriodRequest extends RatePeriodWrite {
  houseIds: string[];
  /** Must be true to apply. Preview calls ignore it. The API refuses an unconfirmed apply. */
  confirmed: boolean;
}

export interface BulkRatePeriodHouseResult {
  houseId: string;
  houseName: string;
  status: 'will_add' | 'conflict';
  conflict: RatePeriodConflict | null;
}

export interface BulkRatePeriodPreview {
  propertyId: string;
  results: BulkRatePeriodHouseResult[];
  addCount: number;
  conflictCount: number;
}

export interface BulkRatePeriodResult {
  propertyId: string;
  addedHouseIds: string[];
  skippedHouseIds: string[];
}

// --- Discounts ---

export interface PercentDiscountEffect {
  kind: 'percent';
  /** Whole percent, 0-100. */
  percent: number;
}

export interface FixedDiscountEffect {
  kind: 'fixed';
  amountCents: number;
}

export type DiscountEffect = PercentDiscountEffect | FixedDiscountEffect;

/** Long stay: the stay has at least this many nights. */
export interface MinNightsCondition {
  kind: 'min_nights';
  nights: number;
}

/** Early bird / last minute: whole days between booking day and check-in. */
export interface BookingLeadDaysCondition {
  kind: 'booking_lead_days';
  minDays: number | null;
  maxDays: number | null;
}

/** Every night of the stay falls inside the window (inclusive nights). */
export interface StayDatesCondition {
  kind: 'stay_dates';
  startDate: string;
  endDate: string;
}

/** The guest books on a day inside the sale window (inclusive). */
export interface BookingWindowCondition {
  kind: 'booking_window';
  startDate: string;
  endDate: string;
}

/** Every night of the stay is one of these weekdays (0 = Sunday ... 6 = Saturday). */
export interface WeekdayCondition {
  kind: 'weekday';
  days: number[];
}

/** The guest typed this code (case-insensitive). */
export interface PromoCodeCondition {
  kind: 'promo_code';
  code: string;
}

export type DiscountCondition =
  | MinNightsCondition
  | BookingLeadDaysCondition
  | StayDatesCondition
  | BookingWindowCondition
  | WeekdayCondition
  | PromoCodeCondition;

export interface DiscountWrite {
  label: string;
  effect: DiscountEffect;
  /** All must match. Empty is only allowed with `alwaysOn`. */
  conditions: DiscountCondition[];
  /** Explicit "applies to every stay" so an empty condition list is never an accident. */
  alwaysOn: boolean;
  /** Null means every house at the property. */
  houseIds: string[] | null;
  /** May stack with other combinable discounts. Otherwise it competes for "best single". */
  combinable: boolean;
  /** Lower runs first when stacking. */
  priority: number;
  active: boolean;
  maxRedemptions: number | null;
}

export interface Discount extends DiscountWrite {
  id: string;
  propertyId: string;
  /** Confirmed stays that used this discount. */
  redemptions: number;
}

// --- Payments ---

export type PaymentStatus = 'requires_payment' | 'succeeded' | 'failed' | 'cancelled';

export interface PaymentSummary {
  id: string;
  holdId: string;
  provider: string;
  status: PaymentStatus;
  amountCents: number;
  currencyCode: string;
  /** True when no real money moves (the mock provider). The guest UI says so plainly. */
  simulated: boolean;
}

export type MockPaymentOutcome = 'success' | 'failure';

export interface MockPaymentRequest {
  outcome: MockPaymentOutcome;
}

/** What the guest gets when a paid hold becomes a confirmed stay. */
export interface ReservationConfirmation {
  reservationId: string;
  /** Short code the guest quotes to the operator, e.g. BK-1A2B3C4D5E. */
  reference: string;
  houseId: string;
  propertyId: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  totalCents: number;
  currencyCode: string;
  bookerName: string;
  bookerEmail: string;
}

export interface MockPaymentResult {
  payment: PaymentSummary;
  /** Set when the payment succeeded and the stay is confirmed. */
  confirmation: ReservationConfirmation | null;
}

// --- Guest-facing cancellation policy ---

export interface CancellationPolicyTier {
  /** Whole days before check-in (property timezone) from which this refund applies. */
  minDaysBeforeCheckIn: number;
  refundPercent: number;
}

/** What a guest may read about cancelling and changing dates. Never includes internal ids or staff data. */
export interface CancellationPolicy {
  propertyId: string;
  /** Highest minimum days first. */
  tiers: CancellationPolicyTier[];
  rebookable: boolean;
  rebookFeeType: RebookFeeType;
  /** Euros for `fixed`, 0 to 100 for `percent`, ignored for `none`. */
  rebookFeeValue: number;
}

// --- Guest self-service: manage and cancel a booking ---

export type GuestBookingStatus = 'confirmed' | 'cancelled';

/** What cancelling right now would refund, from the policy saved with the booking. */
export interface RefundQuote {
  /** What the guest actually paid for the booking. */
  paidCents: number;
  refundPercent: number;
  refundCents: number;
  currencyCode: string;
  /** Whole days from today to check-in in the property's timezone (0 on the day itself). */
  daysBeforeCheckIn: number;
}

export type RefundStatus = 'pending' | 'succeeded' | 'failed';

/** The refund that was issued when a booking was cancelled. */
export interface RefundSummary {
  amountCents: number;
  percent: number;
  currencyCode: string;
  status: RefundStatus;
  /** True when no real money moves (the mock provider). */
  simulated: boolean;
}

/** A booking as its guest may see it. Never includes phone, staff notes, or internal ids beyond the booking id. */
export interface GuestBooking {
  reference: string;
  reservationId: string;
  stayName: string;
  propertyName: string;
  checkIn: string;
  checkOut: string;
  guestCount: number;
  bookerName: string;
  totalCents: number;
  currencyCode: string;
  status: GuestBookingStatus;
  canCancel: boolean;
  /** Why cancelling is not possible online (for example the booking already started), else null. */
  cancelBlockedReason: string | null;
  /** Set when `canCancel`. */
  refundQuote: RefundQuote | null;
  /** Set once cancelled. */
  refund: RefundSummary | null;
  rebookable: boolean;
}

/** The reference and email the guest booked with. Both must match. */
export interface GuestBookingLookupRequest {
  reference: string;
  email: string;
}

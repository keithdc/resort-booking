export type PaymentMethod = 'card' | 'bank_transfer';
export type HoldStatus = 'active' | 'expired' | 'released' | 'confirmed';
export type InventoryKind = 'hold' | 'reservation' | 'block';
export interface Organization {
    id: string;
    name: string;
}
export interface Photo {
    id: string;
    url: string;
    altText: string;
    sortOrder: number;
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
}
export interface PropertyDetail extends PropertySummary {
    addressLine: string;
    postalCode: string;
    photos: Photo[];
}
export interface HouseSummary {
    id: string;
    organizationId: string;
    propertyId: string;
    propertySlug: string;
    propertyName: string;
    propertyCity: string;
    slug: string;
    name: string;
    description: string;
    capacity: number;
    published: boolean;
    nightlyRateCents: number;
    currencyCode: string;
    coverPhotoUrl: string | null;
}
export interface HouseDetail extends HouseSummary {
    latitude: number | null;
    longitude: number | null;
    photos: Photo[];
    propertyPhone: string;
    propertyEmail: string;
    propertyLatitude: number;
    propertyLongitude: number;
    propertyAddressLine: string;
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

// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/reservations/components/new-booking-dialog.test.tsx
 * @feature reservations
 */

import type { HouseSummary, PropertySummary, Quote, StaffBookingQuoteRequest, StaffCreateBookingRequest, StaffReservation } from '@resort-booking/shared-types';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/shared/services/api-client';
import { staffReservation } from '@/test/fixtures';
import { NewBookingDialog } from './new-booking-dialog';

const api = vi.hoisted(() => ({
  quoteStaffBooking: vi.fn<(body: StaffBookingQuoteRequest) => Promise<Quote>>(),
  createStaffBooking: vi.fn<(body: StaffCreateBookingRequest) => Promise<StaffReservation>>(),
}));
const houses = vi.hoisted(() => ({ fetchStaffHouses: vi.fn<(propertyId: string) => Promise<HouseSummary[]>>() }));

vi.mock('../services/staff-reservations-api', () => api);
vi.mock('@/features/property/services/staff-property-api', () => houses);

const TODAY = ((): string => {
  const now = new Date();
  return `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
})();
const FUTURE = '2999-07-10';

function property(overrides: Partial<PropertySummary> = {}): PropertySummary {
  return { id: 'p1', name: 'Alpine Lake', ...overrides } as PropertySummary;
}
function house(overrides: Partial<HouseSummary> = {}): HouseSummary {
  return { id: 'h1', propertyId: 'p1', name: 'Lake Chalet', capacity: 4, currencyCode: 'EUR', ...overrides } as HouseSummary;
}
function quote(overrides: Partial<Quote> = {}): Quote {
  return {
    houseId: 'h1', checkIn: FUTURE, checkOut: '2999-07-12', guestCount: 2, nights: 2, nightlyRateCents: 48000,
    lines: [{ label: 'Standard rate', nights: 2, nightlyRateCents: 48000, subtotalCents: 96000 }],
    subtotalCents: 96000, discounts: [], discountCents: 0, totalCents: 96000, currencyCode: 'EUR', available: true, promoCode: null,
    ...overrides,
  };
}

function renderDialog(properties: PropertySummary[] = [property()]): { onClose: () => void; onCreated: (booking: StaffReservation) => void } {
  const handlers = { onClose: vi.fn<() => void>(), onCreated: vi.fn<(booking: StaffReservation) => void>() };
  render(<NewBookingDialog open properties={properties} defaultPropertyId="" defaultDate={FUTURE} {...handlers} />);
  return handlers;
}

async function fillGuest(): Promise<void> {
  await userEvent.type(screen.getByLabelText(/^Guest name/), 'Grace Hopper');
  await userEvent.type(screen.getByLabelText(/^Guest email/), 'grace@example.com');
}

const bookButton = (): HTMLButtonElement => screen.getByRole('button', { name: /Book it|Saving…/ });

describe('NewBookingDialog', () => {
  beforeEach(() => {
    api.quoteStaffBooking.mockReset();
    api.createStaffBooking.mockReset();
    houses.fetchStaffHouses.mockReset();
    houses.fetchStaffHouses.mockResolvedValue([house()]);
    api.quoteStaffBooking.mockResolvedValue(quote());
  });

  afterEach(cleanup);

  it('starts on the selected day, picks the only property and its only stay, and shows the live price', async () => {
    renderDialog();

    expect((screen.getByLabelText(/^Check-in/) as HTMLInputElement).value).toBe(FUTURE);
    expect(await screen.findByLabelText('Price of the stay')).toBeTruthy();
    expect(houses.fetchStaffHouses).toHaveBeenCalledWith('p1');
    expect(api.quoteStaffBooking).toHaveBeenCalledWith({ houseId: 'h1', checkIn: FUTURE, checkOut: '2999-07-12', guestCount: 2 });
    expect(within(screen.getByLabelText('Price of the stay')).getAllByText(/960,00/).length).toBeGreaterThan(0);
  });

  it('offers Pay at hotel (chosen) and shows Credit card as disabled with "Payment link: coming soon"', async () => {
    renderDialog();
    await screen.findByLabelText('Price of the stay');

    const hotel = screen.getByRole('radio', { name: /Pay at hotel/ }) as HTMLInputElement;
    const card = screen.getByRole('radio', { name: /Credit card/ }) as HTMLInputElement;
    expect(hotel.checked).toBe(true);
    expect(hotel.disabled).toBe(false);
    expect(card.disabled).toBe(true);
    expect(screen.getByText('Payment link: coming soon')).toBeTruthy();
  });

  it('keeps the book button off until there is a price, a name and a valid email', async () => {
    renderDialog();
    await screen.findByLabelText('Price of the stay');
    expect(bookButton().disabled).toBe(true);

    await userEvent.type(screen.getByLabelText(/^Guest name/), 'Grace Hopper');
    await userEvent.type(screen.getByLabelText(/^Guest email/), 'not-an-email');
    expect(bookButton().disabled).toBe(true);

    await userEvent.clear(screen.getByLabelText(/^Guest email/));
    await userEvent.type(screen.getByLabelText(/^Guest email/), 'grace@example.com');
    expect(bookButton().disabled).toBe(false);
  });

  it('saves a pay-at-hotel booking with the trimmed guest, then hands it to the page', async () => {
    const created = staffReservation({ id: 'new-1', reference: 'BK-NEW0000001', paymentMethod: 'pay_at_hotel', paymentStatus: 'pending', paidCents: 0 });
    api.createStaffBooking.mockResolvedValue(created);
    const { onCreated } = renderDialog();
    await screen.findByLabelText('Price of the stay');
    await fillGuest();
    await userEvent.type(screen.getByLabelText(/^Note/), '  late arrival ');

    await userEvent.click(bookButton());

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
    expect(api.createStaffBooking).toHaveBeenCalledWith({
      houseId: 'h1', checkIn: FUTURE, checkOut: '2999-07-12', guestCount: 2, paymentMethod: 'pay_at_hotel',
      bookerName: 'Grace Hopper', bookerEmail: 'grace@example.com', bookerPhone: '', guestNote: 'late arrival',
    });
  });

  it('says so and blocks saving when the dates are not free', async () => {
    api.quoteStaffBooking.mockResolvedValue(quote({ available: false }));
    renderDialog();

    expect(await screen.findByText(/Those dates are not free for this stay/)).toBeTruthy();
    await fillGuest();
    expect(bookButton().disabled).toBe(true);
  });

  it('shows the API\'s answer when someone took the dates a moment ago, and stops the booking', async () => {
    api.createStaffBooking.mockRejectedValue(new ApiRequestError('Those dates are no longer available', 409, { code: 'DATES_UNAVAILABLE' }));
    const { onCreated } = renderDialog();
    await screen.findByLabelText('Price of the stay');
    await fillGuest();

    await userEvent.click(bookButton());

    expect(await screen.findByText('Those dates are no longer available')).toBeTruthy();
    expect(onCreated).not.toHaveBeenCalled();
    expect(bookButton().disabled).toBe(true);
  });

  it('does not ask for a price for a date in the past or too many guests', async () => {
    renderDialog();
    await screen.findByLabelText('Price of the stay');
    api.quoteStaffBooking.mockClear();

    fireEvent.change(screen.getByLabelText(/^Check-in/), { target: { value: '2000-01-01' } });
    expect(await screen.findByText('Check-in cannot be in the past.')).toBeTruthy();
    expect(screen.queryByLabelText('Price of the stay')).toBeNull();

    fireEvent.change(screen.getByLabelText(/^Check-in/), { target: { value: TODAY } });
    fireEvent.change(screen.getByLabelText(/^Guests/), { target: { value: '9' } });
    expect(await screen.findByText(/sleeps up to 4/)).toBeTruthy();
    expect(api.quoteStaffBooking).not.toHaveBeenCalled();
  });

  it('shows a price error and keeps the button off', async () => {
    api.quoteStaffBooking.mockRejectedValue(new ApiRequestError('Guest count exceeds stay capacity', 400, { code: 'CAPACITY_EXCEEDED' }));
    renderDialog();

    expect(await screen.findByText('Guest count exceeds stay capacity')).toBeTruthy();
    expect(bookButton().disabled).toBe(true);
  });

  it('asks which stay when the property has several', async () => {
    houses.fetchStaffHouses.mockResolvedValue([house(), house({ id: 'h2', name: 'Old Barn' })]);
    renderDialog();
    await waitFor(() => expect(houses.fetchStaffHouses).toHaveBeenCalled());

    expect(api.quoteStaffBooking).not.toHaveBeenCalled();
    expect(screen.getByText('Choose a property and a stay.')).toBeTruthy();
  });
});

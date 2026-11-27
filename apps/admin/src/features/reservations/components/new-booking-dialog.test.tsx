// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/reservations/components/new-booking-dialog.test.tsx
 * @feature reservations
 */

import type {
  Discount,
  ExtraService,
  HouseSummary,
  PropertySummary,
  StaffBookingQuote,
  StaffBookingQuoteRequest,
  StaffCreateBookingRequest,
  StaffReservation,
} from '@resort-booking/shared-types';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/shared/services/api-client';
import { staffReservation } from '@/test/fixtures';
import { NewBookingDialog } from './new-booking-dialog';

const api = vi.hoisted(() => ({
  quoteStaffBooking: vi.fn<(body: StaffBookingQuoteRequest) => Promise<StaffBookingQuote>>(),
  fetchStaffBookingExtras: vi.fn<(propertyId: string) => Promise<ExtraService[]>>(),
  fetchStaffPromotions: vi.fn<(propertyId: string) => Promise<Discount[]>>(),
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
function offered(overrides: Partial<ExtraService> = {}): ExtraService {
  return { id: 'x1', organizationId: 'o1', propertyId: 'p1', name: 'Breakfast basket', description: '', kind: 'instant', priceCents: 1800, currencyCode: 'EUR', published: true, ...overrides };
}
function quote(overrides: Partial<StaffBookingQuote> = {}): StaffBookingQuote {
  return {
    houseId: 'h1', checkIn: FUTURE, checkOut: '2999-07-12', guestCount: 2, nights: 2, nightlyRateCents: 48000,
    lines: [{ label: 'Standard rate', nights: 2, nightlyRateCents: 48000, subtotalCents: 96000 }],
    subtotalCents: 96000, discounts: [], discountCents: 0, totalCents: 96000, currencyCode: 'EUR', available: true, promoCode: null,
    extras: [], extrasCents: 0,
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

/** The price area once a price has arrived (it shows placeholder lines while the first one is worked out). */
async function priceArea(): Promise<HTMLElement> {
  return waitFor(() => {
    const area = screen.getByLabelText('Price of the stay');
    if (area.getAttribute('aria-busy') !== 'false') {
      throw new Error('The price is still being worked out');
    }
    return area;
  });
}

const bookButton = (): HTMLButtonElement => screen.getByRole('button', { name: /Book it|Add booking|Saving…/ });

async function chooseSource(label: string): Promise<void> {
  await userEvent.click(screen.getByRole('combobox', { name: /Where did the guest book/ }));
  await userEvent.click(screen.getByRole('option', { name: label }));
}

describe('NewBookingDialog', () => {
  beforeEach(() => {
    api.quoteStaffBooking.mockReset();
    api.createStaffBooking.mockReset();
    api.fetchStaffBookingExtras.mockReset();
    api.fetchStaffBookingExtras.mockResolvedValue([]);
    api.fetchStaffPromotions.mockReset();
    api.fetchStaffPromotions.mockResolvedValue([]);
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
    await waitFor(() => expect(api.quoteStaffBooking).toHaveBeenCalledWith({ houseId: 'h1', checkIn: FUTURE, checkOut: '2999-07-12', guestCount: 2 }));
    await waitFor(() => expect(within(screen.getByLabelText('Price of the stay')).getAllByText(/960,00/).length).toBeGreaterThan(0));
  });

  it('keeps the price area in place while a new price is worked out: a loader on Total, no extra line', async () => {
    renderDialog();
    await waitFor(() => expect(within(screen.getByLabelText('Price of the stay')).getAllByText(/960,00/).length).toBeGreaterThan(0));
    let finish: (value: StaffBookingQuote) => void = () => undefined;
    api.quoteStaffBooking.mockImplementation(() => new Promise<StaffBookingQuote>((resolve) => { finish = resolve; }));
    fireEvent.change(screen.getByLabelText(/^Nights/), { target: { value: '3' } });

    const area = await screen.findByLabelText('Price of the stay');
    await waitFor(() => expect(area.getAttribute('aria-busy')).toBe('true'));
    expect(within(area).getByLabelText('Working out the price')).toBeTruthy();
    expect(within(area).getAllByText(/960,00/).length).toBeGreaterThan(0);
    expect(screen.queryByText('Working out the price…')).toBeNull();

    await waitFor(() => expect(api.quoteStaffBooking).toHaveBeenCalledWith(expect.objectContaining({ checkIn: FUTURE, checkOut: '2999-07-13' })));
    finish(quote({ nights: 3, checkOut: '2999-07-13', subtotalCents: 144000, totalCents: 144000 }));
    await waitFor(() => expect(within(screen.getByLabelText('Price of the stay')).getAllByText(/1.440,00/).length).toBeGreaterThan(0));
    expect(screen.getByLabelText('Price of the stay').getAttribute('aria-busy')).toBe('false');
  });

  it('offers Pay at hotel (chosen) and shows Credit card as disabled with "Payment link: coming soon"', async () => {
    renderDialog();
    await priceArea();

    const hotel = screen.getByRole('radio', { name: /Pay at hotel/ }) as HTMLInputElement;
    const card = screen.getByRole('radio', { name: /Credit card/ }) as HTMLInputElement;
    expect(hotel.checked).toBe(true);
    expect(hotel.disabled).toBe(false);
    expect(card.disabled).toBe(true);
    expect(screen.getByText('Payment link: coming soon')).toBeTruthy();
  });

  it('keeps the book button off until there is a price, a name and a valid email', async () => {
    renderDialog();
    await priceArea();
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
    await priceArea();
    await fillGuest();
    await userEvent.type(screen.getByLabelText(/^Note/), '  late arrival ');

    await userEvent.click(bookButton());

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));
    expect(api.createStaffBooking).toHaveBeenCalledWith({
      houseId: 'h1', checkIn: FUTURE, checkOut: '2999-07-12', guestCount: 2, paymentMethod: 'pay_at_hotel', bookingSource: 'phone_email', channelTotalCents: null,
      bookerName: 'Grace Hopper', bookerEmail: 'grace@example.com', bookerPhone: '', guestNote: 'late arrival',
    });
  });

  it('applies a promo code to the price and the saved booking, shows the answer, and lets it be removed', async () => {
    api.quoteStaffBooking.mockImplementation((request: { promoCode?: string }) =>
      Promise.resolve(
        request.promoCode === 'SUMMER10'
          ? quote({ discountCents: 9600, totalCents: 86400, promoCode: { code: 'SUMMER10', applied: true, message: 'SUMMER10 applied: 10% off' } })
          : quote(),
      ),
    );
    api.createStaffBooking.mockResolvedValue(staffReservation({ id: 'new-2' }));
    renderDialog();
    await priceArea();
    await userEvent.type(screen.getByLabelText(/Promo code/), ' SUMMER10 ');
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(await screen.findByText('SUMMER10 applied: 10% off')).toBeTruthy();
    expect(api.quoteStaffBooking).toHaveBeenLastCalledWith(expect.objectContaining({ promoCode: 'SUMMER10' }));

    await fillGuest();
    await userEvent.click(bookButton());
    await waitFor(() => expect(api.createStaffBooking).toHaveBeenCalledWith(expect.objectContaining({ promoCode: 'SUMMER10' })));

    expect((screen.getByLabelText(/Promo code/) as HTMLInputElement).value.trim()).toBe('SUMMER10');
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
    await userEvent.click(screen.getByLabelText(/Promo code/));
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(api.quoteStaffBooking.mock.calls.at(-1)?.[0]).not.toHaveProperty('promoCode'));
  });

  it('offers the property\'s coupons in the promo field\'s own list and applies one in one click; automatic offers are folded away', async () => {
    const base = { alwaysOn: false, houseIds: null, combinable: false, priority: 100, active: true, propertyId: 'p1', promoted: false } as const;
    api.fetchStaffPromotions.mockResolvedValue([
      { ...base, id: 'd1', label: 'Friends and family', effect: { kind: 'percent', percent: 15 }, conditions: [{ kind: 'promo_code', code: 'FRIEND15' }], redemptions: 0, maxRedemptions: 1 },
      { ...base, id: 'd2', label: 'Long stay', effect: { kind: 'percent', percent: 10 }, conditions: [{ kind: 'min_nights', nights: 7 }], redemptions: 3, maxRedemptions: null },
      { ...base, id: 'd3', label: 'Switched off', active: false, effect: { kind: 'percent', percent: 5 }, conditions: [{ kind: 'promo_code', code: 'OLD5' }], redemptions: 0, maxRedemptions: null },
      { ...base, id: 'd4', label: 'Other stay only', houseIds: ['other'], effect: { kind: 'percent', percent: 5 }, conditions: [{ kind: 'promo_code', code: 'ELSEWHERE' }], redemptions: 0, maxRedemptions: null },
      { ...base, id: 'd5', label: 'Used up', effect: { kind: 'percent', percent: 5 }, conditions: [{ kind: 'promo_code', code: 'GONE' }], redemptions: 1, maxRedemptions: 1 },
    ] as Discount[]);
    renderDialog();
    expect(await screen.findByText('1 coupon for this stay: open the list to pick one.')).toBeTruthy();
    // The automatic offer is one folded line, not a card.
    expect(screen.queryByText(/Long stay/)).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: /1 automatic offer/ }));
    expect(screen.getByRole('list', { name: 'Automatic offers' }).textContent).toContain('Long stay 10% off');

    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    const options = await screen.findAllByRole('option');
    const text = options.map((option) => option.textContent ?? '');
    expect(text.some((row) => row.includes('FRIEND15') && row.includes('0 of 1 used') && row.includes('Not advertised'))).toBe(true);
    expect(text.join(' ')).not.toContain('OLD5');
    expect(text.join(' ')).not.toContain('ELSEWHERE');
    // A coupon that has been used up no longer shows: it cannot apply.
    expect(text.join(' ')).not.toContain('GONE');

    await userEvent.click(options.find((option) => (option.textContent ?? '').includes('FRIEND15')) as HTMLElement);
    await waitFor(() => expect(api.quoteStaffBooking).toHaveBeenLastCalledWith(expect.objectContaining({ promoCode: 'FRIEND15' })));
    expect((screen.getByLabelText(/Promo code/) as HTMLInputElement).value).toBe('FRIEND15');

    // The X on the field takes the code and its discount off, not only the text.
    await userEvent.hover(screen.getByLabelText(/Promo code/));
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(api.quoteStaffBooking.mock.calls.at(-1)?.[0]).not.toHaveProperty('promoCode'));
    expect((screen.getByLabelText(/Promo code/) as HTMLInputElement).value).toBe('');
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Apply' })).toBeNull();
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
    await priceArea();
    await fillGuest();

    await userEvent.click(bookButton());

    expect(await screen.findByText('Those dates are no longer available')).toBeTruthy();
    expect(onCreated).not.toHaveBeenCalled();
    expect(bookButton().disabled).toBe(true);
  });

  it('does not ask for a price for a date in the past or too many guests', async () => {
    renderDialog();
    await priceArea();
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
  describe('where the guest booked', () => {
    it('asks first, offers the six sources and starts on phone or email', async () => {
      renderDialog();
      await priceArea();

      const picker = screen.getByRole('combobox', { name: /Where did the guest book/ });
      expect(picker.textContent).toBe('Phone or email');
      await userEvent.click(picker);
      expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual(['Our website', 'Airbnb', 'Booking.com', 'Another website', 'Phone or email', 'Walk-in']);
    });

    it('saves a walk-in or a booking from our website as pay at hotel with that source and no typed total', async () => {
      api.createStaffBooking.mockResolvedValue(staffReservation({ id: 'new-1' }));
      renderDialog();
      await priceArea();
      await chooseSource('Walk-in');
      await fillGuest();
      await waitFor(() => expect(bookButton().disabled).toBe(false));

      await userEvent.click(bookButton());

      await waitFor(() => expect(api.createStaffBooking).toHaveBeenCalledWith(expect.objectContaining({ paymentMethod: 'pay_at_hotel', bookingSource: 'walk_in', channelTotalCents: null })));
    });

    describe('Airbnb, Booking.com or another website', () => {
      it('swaps the price and the extras for a typed total, and says the guest already paid there', async () => {
        api.fetchStaffBookingExtras.mockResolvedValue([offered()]);
        renderDialog();
        await screen.findByRole('checkbox', { name: /Breakfast basket/ });

        await chooseSource('Airbnb');

        expect(screen.queryByRole('checkbox', { name: /Breakfast basket/ })).toBeNull();
        expect(screen.queryByLabelText('Price of the stay')).toBeNull();
        expect(screen.getByLabelText(/Total the guest paid on Airbnb/)).toBeTruthy();
        expect(screen.getByRole('radio', { name: /Paid through Airbnb/ })).toBeTruthy();
        expect(screen.queryByRole('radio', { name: /Credit card/ })).toBeNull();
        expect(screen.getByRole('button', { name: /Add booking · paid on Airbnb/ })).toBeTruthy();
      });

      it('keeps the button off until a valid total is typed, then saves it as paid by channel with the amount in cents', async () => {
        api.createStaffBooking.mockResolvedValue(staffReservation({ id: 'new-1' }));
        const { onCreated } = renderDialog();
        await priceArea();
        await chooseSource('Booking.com');
        await fillGuest();
        await waitFor(() => expect(screen.getByText('These dates are free.')).toBeTruthy());
        expect(bookButton().disabled).toBe(true);

        await userEvent.type(screen.getByLabelText(/Total the guest paid on Booking.com/), 'abc');
        expect(screen.getByText('Enter an amount like 1200 or 1200,50.')).toBeTruthy();
        expect(bookButton().disabled).toBe(true);
        await userEvent.clear(screen.getByLabelText(/Total the guest paid on Booking.com/));
        await userEvent.type(screen.getByLabelText(/Total the guest paid on Booking.com/), '1234,50');
        expect(bookButton().disabled).toBe(false);

        await userEvent.click(bookButton());

        await waitFor(() => expect(onCreated).toHaveBeenCalled());
        expect(api.createStaffBooking).toHaveBeenCalledWith(
          expect.objectContaining({ paymentMethod: 'paid_by_channel', bookingSource: 'booking_com', channelTotalCents: 123450 }),
        );
        expect(api.createStaffBooking.mock.calls[0]?.[0]).not.toHaveProperty('extras');
      });

      it('still checks the dates against our calendar and blocks the save when they are taken', async () => {
        api.quoteStaffBooking.mockResolvedValue(quote({ available: false }));
        renderDialog();
        await screen.findByText(/Those dates are not free for this stay|These dates are not free/);
        await chooseSource('Another website');
        await fillGuest();
        await userEvent.type(screen.getByLabelText(/Total the guest paid on Another website/), '900');

        expect(screen.getByText('These dates are not free. Pick other dates.')).toBeTruthy();
        expect(bookButton().disabled).toBe(true);
      });

      it('goes back to pay at hotel and extras when the source changes back to one of your own', async () => {
        renderDialog();
        await priceArea();
        await chooseSource('Airbnb');
        await chooseSource('Phone or email');

        expect(screen.getByRole('radio', { name: /Pay at hotel/ })).toBeTruthy();
        expect(screen.queryByLabelText(/Total the guest paid/)).toBeNull();
      });
    });
  });

  describe('extras', () => {
    const BREAKFAST = offered();
    const PILLOWS = offered({ id: 'x2', name: 'Extra pillows', kind: 'on_request', priceCents: 0 });

    beforeEach(() => {
      api.fetchStaffBookingExtras.mockResolvedValue([BREAKFAST, PILLOWS]);
    });

    it('shows no extras section when the property offers none', async () => {
      api.fetchStaffBookingExtras.mockResolvedValue([]);
      renderDialog();
      await priceArea();

      expect(screen.queryByText('Extras')).toBeNull();
    });

    it('lists the property\'s extras with their price or "On request", and asks the API for the list of the chosen property', async () => {
      renderDialog();

      expect(await screen.findByRole('checkbox', { name: /Breakfast basket/ })).toBeTruthy();
      expect(api.fetchStaffBookingExtras).toHaveBeenCalledWith('p1');
      expect(screen.getByText(/18,00/)).toBeTruthy();
      expect(screen.getByRole('checkbox', { name: /Extra pillows/ })).toBeTruthy();
      expect(screen.getByText(/On request · nothing charged now/)).toBeTruthy();
    });

    it('prices a ticked extra again, with its quantity, and shows it in the summary', async () => {
      renderDialog();
      await userEvent.click(await screen.findByRole('checkbox', { name: /Breakfast basket/ }));
      api.quoteStaffBooking.mockResolvedValue(
        quote({
          extras: [{ extraId: 'x1', name: 'Breakfast basket', kind: 'instant', quantity: 2, unitPriceCents: 1800, lineCents: 3600, currencyCode: 'EUR' }],
          extrasCents: 3600,
          totalCents: 99600,
        }),
      );
      fireEvent.change(screen.getByLabelText('How many Breakfast basket'), { target: { value: '2' } });

      await waitFor(() => {
        expect(api.quoteStaffBooking).toHaveBeenLastCalledWith({
          houseId: 'h1', checkIn: FUTURE, checkOut: '2999-07-12', guestCount: 2, extras: [{ extraId: 'x1', quantity: 2 }],
        });
      });
      const summary = await priceArea();
      expect(await within(summary).findByText(/Breakfast basket × 2/)).toBeTruthy();
      expect(within(summary).getAllByText(/996,00/).length).toBeGreaterThan(0);
    });

    it('lists an on-request extra without charging it', async () => {
      renderDialog();
      await userEvent.click(await screen.findByRole('checkbox', { name: /Extra pillows/ }));
      api.quoteStaffBooking.mockResolvedValue(
        quote({
          extras: [{ extraId: 'x2', name: 'Extra pillows', kind: 'on_request', quantity: 1, unitPriceCents: 0, lineCents: 0, currencyCode: 'EUR' }],
        }),
      );
      fireEvent.change(screen.getByLabelText('How many Extra pillows'), { target: { value: '1' } });

      const summary = await priceArea();
      expect(await within(summary).findByText(/Extra pillows × 1 · on request/)).toBeTruthy();
      expect(within(summary).getByText('Not charged now')).toBeTruthy();
    });

    it('unticking an extra leaves it out of the next price', async () => {
      renderDialog();
      const box = await screen.findByRole('checkbox', { name: /Breakfast basket/ });
      await userEvent.click(box);
      await userEvent.click(box);

      await waitFor(() => {
        expect(api.quoteStaffBooking).toHaveBeenLastCalledWith({ houseId: 'h1', checkIn: FUTURE, checkOut: '2999-07-12', guestCount: 2 });
      });
    });

    it('saves the booking with the chosen extras, whole quantities only', async () => {
      api.createStaffBooking.mockResolvedValue(staffReservation({ id: 'new-1' }));
      const handlers = renderDialog();
      await userEvent.click(await screen.findByRole('checkbox', { name: /Breakfast basket/ }));
      fireEvent.change(screen.getByLabelText('How many Breakfast basket'), { target: { value: '3' } });
      await waitFor(() => {
        expect(api.quoteStaffBooking).toHaveBeenLastCalledWith(expect.objectContaining({ extras: [{ extraId: 'x1', quantity: 3 }] }));
      });
      await fillGuest();
      await waitFor(() => expect(bookButton().disabled).toBe(false));

      await userEvent.click(bookButton());

      await waitFor(() => expect(handlers.onCreated).toHaveBeenCalled());
      expect(api.createStaffBooking).toHaveBeenCalledWith(expect.objectContaining({ paymentMethod: 'pay_at_hotel', extras: [{ extraId: 'x1', quantity: 3 }] }));
    });

    it('keeps the extras section out of the way when the list cannot be loaded: the booking still works', async () => {
      api.fetchStaffBookingExtras.mockRejectedValue(new Error('offline'));
      renderDialog();
      await priceArea();

      expect(screen.queryByText('Extras')).toBeNull();
      await fillGuest();
      await waitFor(() => expect(bookButton().disabled).toBe(false));
    });
  });
});

// @vitest-environment jsdom
/**
 * @file apps/web/src/features/houses/components/checkout-form.test.tsx
 * @feature houses
 */

import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import type { Hold, HouseDetail, MockPaymentOutcome, MockPaymentResult, PaymentSummary, Quote, ReservationConfirmation } from '@resort-booking/shared-types';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/shared/services/api-client';
import { StayQuoteProvider } from '../context/stay-quote-context';
import { CheckoutForm } from './checkout-form';
import { ListingHighlights } from './listing-highlights';

const inventory = vi.hoisted(() => ({
  fetchQuote: vi.fn<(houseId: string, checkIn: string, checkOut: string, guestCount: number, promoCode?: string) => Promise<Quote>>(),
  createHold: vi.fn<(body: Record<string, unknown>) => Promise<Hold>>(),
}));

const payments = vi.hoisted(() => ({
  startPayment: vi.fn<(holdId: string) => Promise<PaymentSummary>>(),
  completeMockPayment: vi.fn<(paymentId: string, outcome: MockPaymentOutcome) => Promise<MockPaymentResult>>(),
}));

vi.mock('../services/inventory-api', () => inventory);
vi.mock('@/shared/services/payments-api', () => payments);
vi.mock('@/shared/hooks/use-availability', () => ({
  useHouseAvailability: (): { unavailable: never[]; loading: boolean; failed: boolean; refresh: () => void; maxCheckOutDate: null } => ({
    unavailable: [],
    loading: false,
    failed: false,
    refresh: (): void => undefined,
    maxCheckOutDate: null,
  }),
}));

const HOUSE: HouseDetail = {
  id: 'h1',
  organizationId: 'o',
  propertyId: 'p',
  propertySlug: 'pine-coast',
  propertyName: 'Pine Coast',
  propertyCity: 'Biarritz',
  propertyCountryCode: 'FR',
  propertyTimezone: 'Europe/Paris',
  propertyAddressLine: '1 Rue',
  propertyPostalCode: '64200',
  slug: 'dune',
  name: 'Dune House',
  description: '',
  capacity: 6,
  published: true,
  nightlyRateCents: 18000,
  currencyCode: 'EUR',
  coverPhotoUrl: null,
  mapLatitude: 45.9,
  mapLongitude: 6.1,
  latitude: null,
  longitude: null,
  photos: [],
  amenities: [],
  propertyPhone: '',
  propertyEmail: '',
  propertyLatitude: 0,
  propertyLongitude: 0,
};

const QUOTE: Quote = {
  houseId: 'h1',
  checkIn: '2027-07-10',
  checkOut: '2027-07-11',
  guestCount: 2,
  nights: 1,
  nightlyRateCents: 18000,
  lines: [{ label: 'Standard rate', nights: 1, nightlyRateCents: 18000, subtotalCents: 18000 }],
  subtotalCents: 18000,
  discounts: [],
  discountCents: 0,
  totalCents: 18000,
  currencyCode: 'EUR',
  available: true,
  promoCode: null,
};

const HOLD: Hold = {
  id: 'hold-1',
  houseId: 'h1',
  propertyId: 'p',
  organizationId: 'o',
  checkIn: '2027-07-10',
  checkOut: '2027-07-11',
  guestCount: 2,
  paymentMethod: 'card',
  status: 'active',
  expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  warningAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  holdTtlSeconds: 900,
  bookerName: 'Ada Lovelace',
  bookerEmail: 'ada@example.com',
  bookerPhone: '+33612345678',
  guestNote: '',
  quote: QUOTE,
};

const PAYMENT: PaymentSummary = {
  id: 'pay-1',
  holdId: 'hold-1',
  provider: 'mock',
  status: 'requires_payment',
  amountCents: 18000,
  currencyCode: 'EUR',
  simulated: true,
};

const CONFIRMATION: ReservationConfirmation = {
  reservationId: 'hold-1',
  reference: 'BK-ABC123',
  houseId: 'h1',
  propertyId: 'p',
  checkIn: '2027-07-10',
  checkOut: '2027-07-11',
  guestCount: 2,
  totalCents: 18000,
  currencyCode: 'EUR',
  bookerName: 'Ada Lovelace',
  bookerEmail: 'ada@example.com',
};

function renderForm(): void {
  render(
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <CheckoutForm
        house={HOUSE}
        initialStay={{ checkIn: '2027-07-10', checkOut: '2027-07-11', nights: '1', guestCount: '2', propertySlug: 'pine-coast' }}
        requestOptions={[]}
        extras={[]}
        customRequestsEnabled={false}
      />
    </LocalizationProvider>,
  );
}

function holdButton(): HTMLElement {
  return screen.getByRole('button', { name: /^Pay 180,00\s€$/ });
}

function termsBox(): HTMLInputElement {
  return screen.getByLabelText(/I have read the/) as HTMLInputElement;
}

/** Fills the contact details and, unless told otherwise, ticks the cancellation terms. */
function fill(email: string, phone: string, acceptTerms = true): void {
  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Ada Lovelace' } });
  fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/^Phone/), { target: { value: phone } });
  if (acceptTerms && !termsBox().checked) {
    fireEvent.click(termsBox());
  }
}

describe('CheckoutForm cancellation terms', () => {
  beforeEach(() => {
    inventory.fetchQuote.mockReset();
    inventory.fetchQuote.mockResolvedValue(QUOTE);
    inventory.createHold.mockReset();
    inventory.createHold.mockResolvedValue(HOLD);
    payments.startPayment.mockReset();
    payments.startPayment.mockResolvedValue(PAYMENT);
  });

  afterEach(cleanup);

  it('starts unticked and keeps the hold off even when everything else is valid', async () => {
    renderForm();
    await screen.findByText('These dates are free.');

    fill('ada@example.com', '0612345678', false);

    expect(termsBox().checked).toBe(false);
    expect(holdButton().hasAttribute('disabled')).toBe(true);
  });

  it('allows reserving once the terms are ticked, and blocks it again if they are unticked', async () => {
    renderForm();
    await screen.findByText('These dates are free.');
    fill('ada@example.com', '0612345678', false);

    await userEvent.click(termsBox());
    expect(holdButton().hasAttribute('disabled')).toBe(false);

    await userEvent.click(termsBox());
    expect(holdButton().hasAttribute('disabled')).toBe(true);
  });

  it('says what is being accepted: the cancellation terms and the missing 14-day withdrawal right', async () => {
    renderForm();
    await screen.findByText('These dates are free.');

    const label = (termsBox().closest('label')?.textContent ?? '').replace(/\s/g, ' ');
    expect(label).toContain('I have read the cancellation terms');
    expect(label).toContain('no 14-day right of withdrawal');
  });

  it('links the words "cancellation terms" to the terms on the page', async () => {
    renderForm();
    await screen.findByText('These dates are free.');

    expect(screen.getByRole('link', { name: 'cancellation terms' }).getAttribute('href')).toBe('#cancellation-policy');
  });

  it('tells the API the terms were accepted when the dates are held', async () => {
    renderForm();
    await screen.findByText('These dates are free.');
    fill('ada@example.com', '0612345678');

    await userEvent.click(holdButton());

    expect(inventory.createHold).toHaveBeenCalledWith(expect.objectContaining({ termsAccepted: true }));
  });

  it('is no longer on screen once the dates are held, so it cannot be changed', async () => {
    renderForm();
    await screen.findByText('These dates are free.');
    fill('ada@example.com', '0612345678');
    await userEvent.click(holdButton());
    await screen.findByRole('button', { name: /^Pay / });

    expect(screen.queryByLabelText(/I have read the/)).toBeNull();
  });
});

describe('CheckoutForm contact details', () => {
  beforeEach(() => {
    inventory.fetchQuote.mockReset();
    inventory.fetchQuote.mockResolvedValue(QUOTE);
    inventory.createHold.mockReset();
    inventory.createHold.mockResolvedValue(HOLD);
    payments.startPayment.mockReset();
    payments.startPayment.mockResolvedValue(PAYMENT);
    payments.completeMockPayment.mockReset();
  });

  afterEach(cleanup);

  it('enables the hold once the dates are free and name, email and phone are valid', async () => {
    renderForm();
    await screen.findByText('These dates are free.');

    fill('ada@example.com', '0612345678');

    expect(holdButton().hasAttribute('disabled')).toBe(false);
  });

  it('keeps the hold disabled for a malformed email', async () => {
    renderForm();
    await screen.findByText('These dates are free.');

    fill('ada@example', '0612345678');

    expect(holdButton().hasAttribute('disabled')).toBe(true);
  });

  it('keeps the hold disabled for an incomplete phone number', async () => {
    renderForm();
    await screen.findByText('These dates are free.');

    fill('ada@example.com', '06 12');

    expect(holdButton().hasAttribute('disabled')).toBe(true);
  });

  it('explains a bad email once the guest leaves the field', async () => {
    renderForm();
    await screen.findByText('These dates are free.');
    fill('ada@example', '0612345678');

    fireEvent.blur(screen.getByLabelText(/^Email/));

    expect(await screen.findByText('Enter a valid email address, like name@example.com')).toBeTruthy();
  });

  it('shows the country flag and code on the phone field, ready to change', async () => {
    renderForm();
    await screen.findByText('These dates are free.');

    expect(screen.getByRole('combobox', { name: 'Country calling code' }).textContent).toBe('🇫🇷 +33');
    await userEvent.click(screen.getByRole('combobox', { name: 'Country calling code' }));
    expect(await screen.findByRole('option', { name: /Belgium/ })).toBeTruthy();
  });

  it('does not ask for a hold while the dates are taken, even with valid contact details', async () => {
    inventory.fetchQuote.mockResolvedValue({ ...QUOTE, available: false });
    renderForm();
    await screen.findByText('These dates are not available.');

    fill('ada@example.com', '0612345678');

    await waitFor(() => expect(holdButton().hasAttribute('disabled')).toBe(true));
  });

  describe('promo code', () => {
    const PROMO_QUOTE: Quote = {
      ...QUOTE,
      discounts: [{ discountId: 'd', label: 'Welcome code', amountCents: 2700 }],
      discountCents: 2700,
      totalCents: 15300,
      promoCode: { code: 'WELCOME15', applied: true, message: 'Code WELCOME15 applied' },
    };

    it('prices without a code at first and asks the API again only when Apply is pressed', async () => {
      renderForm();
      await screen.findByText('These dates are free.');
      expect(inventory.fetchQuote.mock.calls.at(-1)?.[4]).toBe('');

      await userEvent.type(screen.getByLabelText(/Promo code/), 'WELCOME15');
      const callsWhileTyping = inventory.fetchQuote.mock.calls.length;
      expect(callsWhileTyping).toBe(1);

      inventory.fetchQuote.mockResolvedValue(PROMO_QUOTE);
      await userEvent.click(screen.getByRole('button', { name: 'Apply' }));

      await waitFor(() => expect(inventory.fetchQuote.mock.calls.at(-1)?.[4]).toBe('WELCOME15'));
      expect(await screen.findByText('Code WELCOME15 applied')).toBeTruthy();
    });

    it('shows the discount line and the lower total the API returned', async () => {
      inventory.fetchQuote.mockResolvedValue(PROMO_QUOTE);
      renderForm();

      expect(await screen.findByText('Welcome code')).toBeTruthy();
      expect((screen.getByLabelText('Price breakdown').textContent ?? '').replace(/\s/g, ' ')).toContain('153,00 €');
    });

    it('removes the code and prices normally again', async () => {
      renderForm();
      await screen.findByText('These dates are free.');
      await userEvent.type(screen.getByLabelText(/Promo code/), 'WELCOME15');
      await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy());

      await userEvent.click(screen.getByRole('button', { name: 'Remove' }));

      await waitFor(() => expect(inventory.fetchQuote.mock.calls.at(-1)?.[4]).toBe(''));
      expect((screen.getByLabelText(/Promo code/) as HTMLInputElement).value).toBe('');
    });

    it('tells the guest plainly when this email already used a once-per-guest code, takes the code off, refreshes the price, and lets Pay continue without it', async () => {
      inventory.createHold.mockRejectedValueOnce(new ApiRequestError('This code has already been used with this email address', 409, 'PROMO_ALREADY_USED'));
      inventory.fetchQuote.mockImplementation((_house, _checkIn, _checkOut, _guests, promo = '') => Promise.resolve(promo === '' ? QUOTE : PROMO_QUOTE));
      renderForm();
      await screen.findByText('These dates are free.');
      await userEvent.type(screen.getByLabelText(/Promo code/), 'WELCOME15');
      await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
      expect(await screen.findByText('Code WELCOME15 applied')).toBeTruthy();
      fill('ada@example.com', '0612345678');
      const quoteCalls = inventory.fetchQuote.mock.calls.length;

      await userEvent.click(screen.getByRole('button', { name: /^Pay / }));

      const alert = await screen.findByRole('alert');
      expect(alert.textContent).toContain('This code has already been used with this email address');
      expect(alert.textContent).toContain('The price now shows without the code: press Pay to continue.');
      expect(screen.queryByText(/Something went wrong|Could not hold/)).toBeNull();
      expect((screen.getByLabelText(/Promo code/) as HTMLInputElement).value).toBe('');
      await waitFor(() => expect(inventory.fetchQuote.mock.calls.length).toBeGreaterThan(quoteCalls));
      expect(inventory.fetchQuote.mock.calls.at(-1)?.[4]).toBe('');
      expect(screen.queryByRole('timer')).toBeNull();

      // Pay again: the hold is made without the code.
      await userEvent.click(holdButton());
      await waitFor(() => expect(inventory.createHold).toHaveBeenCalledTimes(2));
      expect(inventory.createHold.mock.calls[1]?.[0]).not.toHaveProperty('promoCode');
      expect(await screen.findByRole('heading', { name: 'Complete your payment' })).toBeTruthy();
    });

    it('keeps a wrong code from blocking the booking', async () => {
      inventory.fetchQuote.mockResolvedValue({
        ...QUOTE,
        promoCode: { code: 'NOPE', applied: false, message: 'That code is not valid' },
      });
      renderForm();
      await screen.findByText('These dates are free.');
      await userEvent.type(screen.getByLabelText(/Promo code/), 'NOPE');
      await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
      expect(await screen.findByText('That code is not valid')).toBeTruthy();

      fill('ada@example.com', '0612345678');

      expect(holdButton().hasAttribute('disabled')).toBe(false);
    });
  });

  describe('paying', () => {
    async function holdTheDates(): Promise<void> {
      renderForm();
      await screen.findByText('These dates are free.');
      fill('ada@example.com', '0612345678');
      await userEvent.click(holdButton());
    }

    it('offers the test-mode payment right after a card hold', async () => {
      await holdTheDates();

      expect(await screen.findByRole('button', { name: /^Pay / })).toBeTruthy();
      expect(screen.getByText(/no real money moves/i)).toBeTruthy();
      expect(payments.startPayment).toHaveBeenCalledWith('hold-1');
    });

    it('sends the typed contact details with the hold', async () => {
      await holdTheDates();

      expect(inventory.createHold).toHaveBeenCalledWith(
        expect.objectContaining({ bookerEmail: 'ada@example.com', bookerPhone: '+33612345678', bookerName: 'Ada Lovelace' }),
      );
    });

    it('replaces the form with the confirmation and reference once paid', async () => {
      payments.completeMockPayment.mockResolvedValue({ payment: { ...PAYMENT, status: 'succeeded' }, confirmation: CONFIRMATION, rebookedBooking: null });
      await holdTheDates();

      await userEvent.click(await screen.findByRole('button', { name: /^Pay / }));

      expect(await screen.findByText('BK-ABC123')).toBeTruthy();
      expect(screen.getByText('Your booking is confirmed.')).toBeTruthy();
      expect(screen.queryByRole('button', { name: /^Pay / })).toBeNull();
    });

    it('after a declined card, drops the hold and lets the guest try again with the form still filled', async () => {
      payments.completeMockPayment.mockResolvedValue({ payment: { ...PAYMENT, status: 'failed' }, confirmation: null, rebookedBooking: null });
      await holdTheDates();

      await userEvent.click(await screen.findByRole('button', { name: 'Simulate a declined card' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

      expect(screen.queryByRole('timer')).toBeNull();
      expect((screen.getByLabelText(/^Name/) as HTMLInputElement).value).toBe('Ada Lovelace');
      expect(holdButton().hasAttribute('disabled')).toBe(false);
    });

    it('explains a bank-transfer hold instead of showing the card payment', async () => {
      inventory.createHold.mockResolvedValue({ ...HOLD, paymentMethod: 'bank_transfer', holdTtlSeconds: 172800 });
      renderForm();
      await screen.findByText('These dates are free.');
      fill('ada@example.com', '0612345678');
      await userEvent.click(screen.getByLabelText(/bank transfer/i));
      await userEvent.click(screen.getByRole('button', { name: 'Reserve and pay by bank transfer' }));

      expect(await screen.findByText(/holding these dates for you for 48 hours/)).toBeTruthy();
      expect(screen.getByText(/operator confirms your booking once your payment arrives/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: /^Pay / })).toBeNull();
      expect(payments.startPayment).not.toHaveBeenCalled();
    });
  });
});

describe('CheckoutForm single Pay button and hold timer', () => {
  const NOW = '2027-05-01T12:00:00.000Z';

  beforeEach(() => {
    inventory.fetchQuote.mockReset();
    inventory.fetchQuote.mockResolvedValue(QUOTE);
    inventory.createHold.mockReset();
    inventory.createHold.mockResolvedValue(HOLD);
    payments.startPayment.mockReset();
    payments.startPayment.mockResolvedValue(PAYMENT);
    payments.completeMockPayment.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    cleanup();
  });

  it('labels the one primary button with the total to pay, never Reserve', async () => {
    renderForm();
    await screen.findByText('These dates are free.');

    expect(screen.getByRole('button', { name: /^Pay 180,00\s€$/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Reserve$|Hold these dates/ })).toBeNull();
  });

  it('keeps the Pay button off until the terms are ticked', async () => {
    renderForm();
    await screen.findByText('These dates are free.');
    fill('ada@example.com', '0612345678', false);

    expect(holdButton().hasAttribute('disabled')).toBe(true);
    fireEvent.click(termsBox());
    expect(holdButton().hasAttribute('disabled')).toBe(false);
  });

  it('keeps an explicit label for the bank-transfer flow', async () => {
    renderForm();
    await screen.findByText('These dates are free.');
    await userEvent.click(screen.getByLabelText(/bank transfer/i));

    expect(screen.getByRole('button', { name: 'Reserve and pay by bank transfer' })).toBeTruthy();
    expect(screen.getByText('We hold your dates while your transfer arrives. Nothing is charged until you pay.')).toBeTruthy();
  });

  it('swaps the form for the payment step once the dates are held: one way forward', async () => {
    renderForm();
    await screen.findByText('These dates are free.');
    fill('ada@example.com', '0612345678');

    await userEvent.click(holdButton());

    expect(await screen.findByRole('heading', { name: 'Complete your payment' })).toBeTruthy();
    expect(screen.getByRole('timer')).toBeTruthy();
    expect(screen.queryByLabelText(/I have read the/)).toBeNull();
    expect(screen.queryByLabelText(/^Name/)).toBeNull();
    expect(screen.queryByLabelText(/^Nights/)).toBeNull();
    expect(await screen.findAllByRole('button', { name: /^Pay / })).toHaveLength(1);
  });

  it('says calmly that the dates were just taken on a 409 and refreshes the quote', async () => {
    inventory.createHold.mockRejectedValue(new ApiRequestError('Those dates are no longer available', 409, 'DATES_UNAVAILABLE'));
    renderForm();
    await screen.findByText('These dates are free.');
    fill('ada@example.com', '0612345678');
    const quoteCalls = inventory.fetchQuote.mock.calls.length;

    await userEvent.click(holdButton());

    expect((await screen.findByRole('alert')).textContent).toBe('Sorry, those dates were just taken. Pick other dates.');
    expect(screen.queryByRole('timer')).toBeNull();
    expect(screen.getByLabelText(/^Name/)).toBeTruthy();
    await waitFor(() => expect(inventory.fetchQuote.mock.calls.length).toBeGreaterThan(quoteCalls));
  });

  it('shows the API message for any other hold failure', async () => {
    inventory.createHold.mockRejectedValue(new ApiRequestError('Too many guests', 400, 'CAPACITY_EXCEEDED'));
    renderForm();
    await screen.findByText('These dates are free.');
    fill('ada@example.com', '0612345678');

    await userEvent.click(holdButton());

    expect(await screen.findByText('Too many guests')).toBeTruthy();
    expect(screen.queryByText(/just taken/)).toBeNull();
  });

  it('says before paying that the dates are held and that nothing is charged yet, with no minutes promised', async () => {
    renderForm();
    await screen.findByText('These dates are free.');

    expect(screen.getByText('We hold your dates while you pay. Nothing is charged until you pay.')).toBeTruthy();
    expect(screen.queryByText(/minutes/)).toBeNull();
  });

  it('does not offer the hold length in the payment choices either', async () => {
    renderForm();
    await screen.findByText('These dates are free.');

    expect(screen.getByLabelText(/Apple Pay \/ Google Pay \/ card/).closest('label')?.textContent).not.toMatch(/\d/);
    expect(screen.getByLabelText(/Bank transfer/).closest('label')?.textContent).not.toMatch(/\d/);
  });

  it('shows NO countdown before the guest pays', async () => {
    renderForm();
    await screen.findByText('These dates are free.');
    fill('ada@example.com', '0612345678');

    expect(screen.queryByLabelText('Hold countdown')).toBeNull();
    expect(screen.queryByRole('timer')).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('does not even start a clock before the guest pays', async () => {
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    renderForm();
    await screen.findByText('These dates are free.');
    fill('ada@example.com', '0612345678');

    const ticks = (): number => setIntervalSpy.mock.calls.filter((call) => call[1] === 1000).length;
    expect(ticks()).toBe(0);

    await userEvent.click(holdButton());
    await screen.findByRole('timer');

    expect(ticks()).toBe(1);
  });

  it('starts the countdown only after Pay, saying how long the API is holding the dates', async () => {
    renderForm();
    await screen.findByText('These dates are free.');
    fill('ada@example.com', '0612345678');

    await userEvent.click(holdButton());

    expect(await screen.findByText('We are holding these dates for you for 15 minutes.')).toBeTruthy();
    expect(screen.getByRole('timer').textContent).toMatch(/^1[45]:\d\d$/);
    expect(screen.queryByText(/We hold your dates while you pay/)).toBeNull();
  });

  it('shows "Holding your dates…" while the hold is being made', async () => {
    let finish: (hold: Hold) => void = () => undefined;
    inventory.createHold.mockImplementation(() => new Promise<Hold>((resolve) => { finish = resolve; }));
    renderForm();
    await screen.findByText('These dates are free.');
    fill('ada@example.com', '0612345678');

    await userEvent.click(holdButton());

    expect(screen.getByRole('button', { name: 'Holding your dates…' }).hasAttribute('disabled')).toBe(true);
    finish(HOLD);
    await screen.findByRole('timer');
  });

  it('counts down each second from the hold the API returned', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'], now: new Date(NOW) });
    inventory.createHold.mockResolvedValue({
      ...HOLD,
      expiresAt: '2027-05-01T12:15:00.000Z',
      warningAt: '2027-05-01T12:10:00.000Z',
    });
    renderForm();
    await screen.findByText('These dates are free.');
    fill('ada@example.com', '0612345678');
    await userEvent.click(holdButton());
    expect((await screen.findByRole('timer')).textContent).toBe('15:00');

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.getByRole('timer').textContent).toBe('14:57');
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');
  });

  it('warns calmly when the API\'s warning time passes, and not before', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'], now: new Date(NOW) });
    inventory.createHold.mockResolvedValue({
      ...HOLD,
      expiresAt: '2027-05-01T12:15:00.000Z',
      warningAt: '2027-05-01T12:10:00.000Z',
    });
    renderForm();
    await screen.findByText('These dates are free.');
    fill('ada@example.com', '0612345678');
    await userEvent.click(holdButton());
    await screen.findByRole('timer');
    expect(screen.queryByText(/Less than/)).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(10 * 60_000);
    });

    expect(screen.getByRole('status').textContent).toBe('Less than 5 minutes left. Finish paying to keep your dates.');
    expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
  });

  it('says time ran out, keeps the form filled and lets the guest hold the dates again', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'], now: new Date(NOW) });
    inventory.createHold
      .mockResolvedValueOnce({ ...HOLD, expiresAt: '2027-05-01T12:00:05.000Z', warningAt: '2027-05-01T11:55:05.000Z' })
      .mockResolvedValueOnce({ ...HOLD, id: 'hold-2', expiresAt: '2027-05-01T12:20:00.000Z', warningAt: '2027-05-01T12:15:00.000Z' });
    renderForm();
    await screen.findByText('These dates are free.');
    fill('ada@example.com', '0612345678');
    await userEvent.click(holdButton());
    await screen.findByRole('timer');

    await act(async () => {
      vi.advanceTimersByTime(6000);
    });

    expect(screen.getByText('Time ran out — your details are still here.')).toBeTruthy();
    expect((screen.getByLabelText(/^Name/) as HTMLInputElement).value).toBe('Ada Lovelace');
    expect((screen.getByLabelText(/^Email/) as HTMLInputElement).value).toBe('ada@example.com');

    await userEvent.click(screen.getByRole('button', { name: 'Hold the dates again' }));

    expect(inventory.createHold).toHaveBeenCalledTimes(2);
    // Six fake seconds have passed since the clock started, so 20:00 minus 6s.
    expect((await screen.findByRole('timer')).textContent).toBe('19:54');
    expect(screen.queryByText('Time ran out — your details are still here.')).toBeNull();
  });

  it('counts a bank-transfer hold in hours, from the API\'s length', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'], now: new Date(NOW) });
    inventory.createHold.mockResolvedValue({
      ...HOLD,
      paymentMethod: 'bank_transfer',
      holdTtlSeconds: 172800,
      expiresAt: '2027-05-03T12:00:00.000Z',
      warningAt: '2027-05-03T11:55:00.000Z',
    });
    renderForm();
    await screen.findByText('These dates are free.');
    fill('ada@example.com', '0612345678');
    await userEvent.click(screen.getByLabelText(/Bank transfer/));
    await userEvent.click(screen.getByRole('button', { name: 'Reserve and pay by bank transfer' }));

    expect(await screen.findByText('We are holding these dates for you for 48 hours.')).toBeTruthy();
    expect(screen.getByRole('timer').textContent).toBe('48:00:00');
  });

  it('removes the countdown when a declined card releases the dates', async () => {
    payments.completeMockPayment.mockResolvedValue({ payment: { ...PAYMENT, status: 'failed' }, confirmation: null, rebookedBooking: null });
    renderForm();
    await screen.findByText('These dates are free.');
    fill('ada@example.com', '0612345678');
    await userEvent.click(holdButton());
    await screen.findByRole('timer');

    await userEvent.click(await screen.findByRole('button', { name: 'Simulate a declined card' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(screen.queryByRole('timer')).toBeNull();
    expect(screen.getByText('We hold your dates while you pay. Nothing is charged until you pay.')).toBeTruthy();
  });
});

describe('Stay header follows the dates in the checkout', () => {
  const LINE = (label: string, nights: number, nightlyRateCents: number): Quote['lines'][number] => ({
    label,
    nights,
    nightlyRateCents,
    subtotalCents: nights * nightlyRateCents,
  });

  function quoteFor(checkOut: string, lines: Quote['lines'], extra: Partial<Quote> = {}): Quote {
    return { ...QUOTE, checkOut, lines, ...extra };
  }

  function header(): string {
    return (screen.getByText(/Stay in/).textContent ?? '').replace(/\s/g, ' ');
  }

  function renderPage(): void {
    render(
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <StayQuoteProvider>
          <ListingHighlights city="Annecy" sleeps={8} standardRateCents={HOUSE.nightlyRateCents} currencyCode="EUR" />
          <CheckoutForm
            house={HOUSE}
            initialStay={{ checkIn: '2027-07-10', checkOut: '2027-07-11', nights: '1', guestCount: '2', propertySlug: 'pine-coast' }}
            requestOptions={[]}
            extras={[]}
            customRequestsEnabled={false}
          />
        </StayQuoteProvider>
      </LocalizationProvider>,
    );
  }

  beforeEach(() => {
    inventory.fetchQuote.mockReset();
    inventory.fetchQuote.mockImplementation((_house, _checkIn, checkOut, _guests, promo = '') => {
      if (checkOut === '2027-07-13') {
        return Promise.resolve(quoteFor(checkOut, [LINE('Peak summer 2027', 3, 30000)]));
      }
      if (checkOut === '2027-07-15') {
        return Promise.resolve(quoteFor(checkOut, [LINE('Standard rate', 2, 18000), LINE('Peak summer 2027', 3, 30000)]));
      }
      if (checkOut === '2027-07-17') {
        return Promise.resolve(
          quoteFor(checkOut, [LINE('Peak summer 2027', 7, 30000)], {
            discounts: promo === '' ? [] : [{ discountId: 'd', label: 'Welcome code', amountCents: 5000 }],
            discountCents: promo === '' ? 0 : 5000,
          }),
        );
      }
      return Promise.resolve(quoteFor(checkOut, [LINE('Standard rate', 1, 18000)]));
    });
  });

  afterEach(cleanup);

  it('starts on the standard rate', async () => {
    renderPage();
    await screen.findByText('These dates are free.');

    expect(header()).toContain('Standard rate 180,00 € / night');
  });

  it('switches to the seasonal rate and its name when the dates move into the season', async () => {
    renderPage();
    await screen.findByText('These dates are free.');

    fireEvent.change(screen.getByLabelText(/^Nights/), { target: { value: '3' } });

    await waitFor(() => expect(header()).toContain('300,00 € / night · Peak summer 2027'));
    expect(header()).not.toContain('Standard rate');
  });

  it('shows a range when the dates cross seasons, then returns to one rate again', async () => {
    renderPage();
    await screen.findByText('These dates are free.');

    fireEvent.change(screen.getByLabelText(/^Nights/), { target: { value: '5' } });
    await waitFor(() => expect(header()).toContain('180,00 € – 300,00 € / night'));

    fireEvent.change(screen.getByLabelText(/^Nights/), { target: { value: '3' } });
    await waitFor(() => expect(header()).toContain('300,00 € / night · Peak summer 2027'));
    expect(header()).not.toContain('–');
  });

  it('keeps the nightly rate when a promo code takes money off the total', async () => {
    renderPage();
    await screen.findByText('These dates are free.');
    fireEvent.change(screen.getByLabelText(/^Nights/), { target: { value: '7' } });
    await waitFor(() => expect(header()).toContain('300,00 € / night · Peak summer 2027'));

    await userEvent.type(screen.getByLabelText(/Promo code/), 'WELCOME15');
    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(await screen.findByText('Welcome code')).toBeTruthy();
    expect(header()).toContain('300,00 € / night · Peak summer 2027');
  });

  it('goes back to the standard rate when the dates cannot be priced', async () => {
    renderPage();
    await screen.findByText('These dates are free.');
    fireEvent.change(screen.getByLabelText(/^Nights/), { target: { value: '3' } });
    await waitFor(() => expect(header()).toContain('Peak summer 2027'));

    inventory.fetchQuote.mockRejectedValue(new Error('offline'));
    fireEvent.change(screen.getByLabelText(/^Nights/), { target: { value: '4' } });

    await waitFor(() => expect(header()).toContain('Standard rate 180,00 € / night'));
  });
});

describe('CheckoutForm offers', () => {
  const LONG_STAY = {
    id: 'o1',
    name: 'Long stay',
    kind: 'percent' as const,
    value: 10,
    currencyCode: null,
    minNights: 7,
    nightsOnly: true,
    promoCode: null,
    houseIds: null,
    validFrom: null,
    validTo: null,
    headline: 'Save 10% when you stay 7 or more nights',
  };

  function renderWith(extra: { offers?: (typeof LONG_STAY)[]; initialPromoCode?: string }): void {
    render(
      <LocalizationProvider dateAdapter={AdapterDayjs}>
        <CheckoutForm
          house={HOUSE}
          initialStay={{ checkIn: '2027-07-10', checkOut: '2027-07-11', nights: '1', guestCount: '2', propertySlug: 'pine-coast' }}
          requestOptions={[]}
          extras={[]}
          customRequestsEnabled={false}
          {...extra}
        />
      </LocalizationProvider>,
    );
  }

  beforeEach(() => {
    inventory.fetchQuote.mockReset();
    inventory.fetchQuote.mockResolvedValue(QUOTE);
  });

  afterEach(cleanup);

  it('invites a longer stay with the nights still missing, and stops once there are enough', async () => {
    renderWith({ offers: [LONG_STAY] });
    await screen.findByText('These dates are free.');
    expect(screen.getByText('Add 6 more nights to save 10%')).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/^Nights/), { target: { value: '5' } });
    expect(await screen.findByText('Add 2 more nights to save 10%')).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/^Nights/), { target: { value: '7' } });
    await waitFor(() => expect(screen.queryByText(/more night/)).toBeNull());
  });

  it('shows no hint without offers', async () => {
    renderWith({});
    await screen.findByText('These dates are free.');
    expect(screen.queryByText(/more night/)).toBeNull();
  });

  it('puts a code from the link in the promo field but does not apply it', async () => {
    renderWith({ initialPromoCode: 'WELCOME10' });
    await screen.findByText('These dates are free.');

    expect((screen.getByLabelText(/Promo code/) as HTMLInputElement).value).toBe('WELCOME10');
    expect(inventory.fetchQuote.mock.calls.every((call) => call[4] === '')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(inventory.fetchQuote.mock.calls.at(-1)?.[4]).toBe('WELCOME10'));
  });
});

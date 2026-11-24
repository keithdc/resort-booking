// @vitest-environment jsdom
/**
 * @file apps/web/src/features/houses/components/checkout-form.test.tsx
 * @feature houses
 */

import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import type { Hold, HouseDetail, MockPaymentOutcome, MockPaymentResult, PaymentSummary, Quote, ReservationConfirmation } from '@resort-booking/shared-types';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckoutForm } from './checkout-form';

const inventory = vi.hoisted(() => ({
  fetchQuote: vi.fn<(houseId: string, checkIn: string, checkOut: string, guestCount: number, promoCode?: string) => Promise<Quote>>(),
  createHold: vi.fn<() => Promise<Hold>>(),
}));

const payments = vi.hoisted(() => ({
  startPayment: vi.fn<(holdId: string) => Promise<PaymentSummary>>(),
  completeMockPayment: vi.fn<(paymentId: string, outcome: MockPaymentOutcome) => Promise<MockPaymentResult>>(),
}));

vi.mock('../services/inventory-api', () => inventory);
vi.mock('../services/payments-api', () => payments);
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
  return screen.getByRole('button', { name: 'Hold these dates' });
}

function fill(email: string, phone: string): void {
  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Ada Lovelace' } });
  fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/^Phone/), { target: { value: phone } });
}

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
      payments.completeMockPayment.mockResolvedValue({ payment: { ...PAYMENT, status: 'succeeded' }, confirmation: CONFIRMATION });
      await holdTheDates();

      await userEvent.click(await screen.findByRole('button', { name: /^Pay / }));

      expect(await screen.findByText('BK-ABC123')).toBeTruthy();
      expect(screen.getByText('Your stay is confirmed.')).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Hold these dates' })).toBeNull();
    });

    it('after a declined card, drops the hold and lets the guest hold the dates again with the form still filled', async () => {
      payments.completeMockPayment.mockResolvedValue({ payment: { ...PAYMENT, status: 'failed' }, confirmation: null });
      await holdTheDates();

      await userEvent.click(await screen.findByRole('button', { name: 'Simulate a declined card' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Hold the dates again' }));

      expect(screen.queryByRole('button', { name: /^Pay / })).toBeNull();
      expect((screen.getByLabelText(/^Name/) as HTMLInputElement).value).toBe('Ada Lovelace');
      expect(holdButton().hasAttribute('disabled')).toBe(false);
    });

    it('explains a bank-transfer hold instead of showing the card payment', async () => {
      inventory.createHold.mockResolvedValue({ ...HOLD, paymentMethod: 'bank_transfer' });
      renderForm();
      await screen.findByText('These dates are free.');
      fill('ada@example.com', '0612345678');
      await userEvent.click(screen.getByLabelText(/bank transfer/i));
      await userEvent.click(holdButton());

      expect(await screen.findByText(/held for 48 hours/)).toBeTruthy();
      expect(screen.queryByRole('button', { name: /^Pay / })).toBeNull();
      expect(payments.startPayment).not.toHaveBeenCalled();
    });
  });
});

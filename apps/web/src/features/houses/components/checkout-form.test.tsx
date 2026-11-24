// @vitest-environment jsdom
/**
 * @file apps/web/src/features/houses/components/checkout-form.test.tsx
 * @feature houses
 */

import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import type { HouseDetail, Quote } from '@resort-booking/shared-types';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CheckoutForm } from './checkout-form';

const inventory = vi.hoisted(() => ({
  fetchQuote: vi.fn<(houseId: string, checkIn: string, checkOut: string, guestCount: number) => Promise<Quote>>(),
  createHold: vi.fn<() => Promise<never>>(),
}));

vi.mock('../services/inventory-api', () => inventory);
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
  totalCents: 18000,
  currencyCode: 'EUR',
  available: true,
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
});

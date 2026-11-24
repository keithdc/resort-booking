// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/property/components/property-discounts-panel.test.tsx
 * @feature property
 */

import type { Discount, DiscountWrite, HouseSummary } from '@resort-booking/shared-types';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/shared/services/api-client';
import { PropertyDiscountsPanel } from './property-discounts-panel';

const api = vi.hoisted(() => ({
  fetchDiscounts: vi.fn<(propertyId: string) => Promise<Discount[]>>(),
  createDiscount: vi.fn<(propertyId: string, body: DiscountWrite) => Promise<Discount>>(),
  updateDiscount: vi.fn<(discountId: string, body: DiscountWrite) => Promise<Discount>>(),
  deleteDiscount: vi.fn<(discountId: string) => Promise<null>>(),
}));

vi.mock('../services/staff-discounts-api', () => api);

function house(id: string, name: string): HouseSummary {
  return {
    id,
    organizationId: 'o',
    propertyId: 'p1',
    propertySlug: 'p',
    propertyName: 'P',
    propertyCity: '',
    propertyCountryCode: 'FR',
    propertyTimezone: 'Europe/Paris',
    propertyAddressLine: '',
    propertyPostalCode: '',
    slug: id,
    name,
    description: '',
    capacity: 4,
    published: true,
    nightlyRateCents: 10000,
    currencyCode: 'EUR',
    coverPhotoUrl: null,
    mapLatitude: 45.9,
    mapLongitude: 6.1,
  };
}

const HOUSES = [house('h1', 'Dune House'), house('h2', 'Cedar Cabin')];

function discount(id: string, overrides: Partial<Discount> = {}): Discount {
  return {
    id,
    propertyId: 'p1',
    label: `Discount ${id}`,
    effect: { kind: 'percent', percent: 10 },
    conditions: [{ kind: 'min_nights', nights: 7 }],
    alwaysOn: false,
    houseIds: null,
    combinable: false,
    priority: 100,
    active: true,
    maxRedemptions: null,
    redemptions: 0,
    ...overrides,
  };
}

const LONG_STAY = discount('long', { label: 'Long stay', redemptions: 3, maxRedemptions: 10 });
const WELCOME = discount('welcome', {
  label: 'Welcome code',
  effect: { kind: 'fixed', amountCents: 2000 },
  conditions: [{ kind: 'promo_code', code: 'WELCOME15' }],
  houseIds: ['h1'],
  combinable: true,
  priority: 5,
  active: false,
});

function renderPanel(): void {
  render(<PropertyDiscountsPanel propertyId="p1" houses={HOUSES} />);
}

function row(name: string): HTMLElement {
  return screen.getByRole('row', { name: new RegExp(name) });
}

function plain(text: string | null): string {
  return (text ?? '').replace(/\s/g, ' ');
}

describe('PropertyDiscountsPanel', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.fetchDiscounts.mockResolvedValue([LONG_STAY, WELCOME]);
  });

  afterEach(cleanup);

  it('lists each discount with its size, plain-language conditions, scope, stacking and uses', async () => {
    renderPanel();

    await screen.findByRole('table', { name: 'Discounts' });
    const longStay = plain(row('Long stay').textContent);
    expect(longStay).toContain('10%');
    expect(longStay).toContain('7+ nights');
    expect(longStay).toContain('All stays');
    expect(longStay).toContain('Best single · priority 100');
    expect(longStay).toContain('3 of 10 used');
    expect(longStay).toContain('On');

    const welcome = plain(row('Welcome code').textContent);
    expect(welcome).toContain('20,00 €');
    expect(welcome).toContain('code WELCOME15');
    expect(welcome).toContain('Dune House');
    expect(welcome).not.toContain('Cedar Cabin');
    expect(welcome).toContain('Can combine · priority 5');
    expect(welcome).toContain('Unlimited');
    expect(welcome).toContain('Off');
  });

  it('shows a helpful empty state', async () => {
    api.fetchDiscounts.mockResolvedValue([]);

    renderPanel();

    expect(await screen.findByText(/No discounts yet/)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows the load error', async () => {
    api.fetchDiscounts.mockRejectedValue(new ApiRequestError('Property not found', 404));

    renderPanel();

    expect((await screen.findByRole('alert')).textContent).toContain('Property not found');
  });

  it('opens the editor, filled in, when a row is clicked', async () => {
    renderPanel();
    await screen.findByRole('table');

    await userEvent.click(row('Long stay'));

    const dialog = await screen.findByRole('dialog', { name: 'Edit discount' });
    expect((within(dialog).getByLabelText(/^Name/) as HTMLInputElement).value).toBe('Long stay');
  });

  it('opens the editor from the Edit button too', async () => {
    renderPanel();
    await screen.findByRole('table');

    await userEvent.click(within(row('Welcome code')).getByRole('button', { name: 'Edit' }));

    expect(await screen.findByRole('dialog', { name: 'Edit discount' })).toBeTruthy();
  });

  describe('delete', () => {
    it('asks first, and keeps the discount if the person backs out', async () => {
      renderPanel();
      await screen.findByRole('table');

      await userEvent.click(within(row('Long stay')).getByRole('button', { name: 'Delete' }));
      expect(screen.queryByRole('dialog', { name: 'Edit discount' })).toBeNull();
      await userEvent.click(await screen.findByRole('button', { name: 'Keep it' }));

      expect(api.deleteDiscount).not.toHaveBeenCalled();
    });

    it('removes it once confirmed and says so', async () => {
      api.deleteDiscount.mockResolvedValue(null);
      renderPanel();
      await screen.findByRole('table');

      await userEvent.click(within(row('Long stay')).getByRole('button', { name: 'Delete' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));

      await waitFor(() => expect(api.deleteDiscount).toHaveBeenCalledWith('long'));
      expect(await screen.findByText('Discount removed')).toBeTruthy();
    });
  });

  describe('adding a discount', () => {
    async function fillNew(): Promise<void> {
      await userEvent.click(screen.getByRole('button', { name: 'Add a discount' }));
      const dialog = await screen.findByRole('dialog', { name: 'Add a discount' });
      fireEvent.change(within(dialog).getByLabelText(/^Name/), { target: { value: 'Early bird' } });
      fireEvent.change(within(dialog).getByLabelText(/^Percentage \(%\)/), { target: { value: '8' } });
      await userEvent.click(within(dialog).getByRole('checkbox', { name: /Always on/ }));
    }

    it('warns before a new discount for all houses goes live, and writes nothing until confirmed', async () => {
      renderPanel();
      await screen.findByRole('table');
      await fillNew();

      await userEvent.click(screen.getByRole('button', { name: 'Add discount' }));

      const warning = await screen.findByRole('dialog', { name: 'Apply this discount to every stay?' });
      expect(warning.textContent).toContain('Early bird');
      expect(api.createDiscount).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(within(warning).getByRole('button', { name: 'Cancel' }));
    });

    it('saves after confirming and refreshes the list', async () => {
      api.createDiscount.mockResolvedValue(discount('new'));
      renderPanel();
      await screen.findByRole('table');
      await fillNew();
      await userEvent.click(screen.getByRole('button', { name: 'Add discount' }));

      await userEvent.click(await screen.findByRole('button', { name: 'Apply to all stays' }));

      await waitFor(() =>
        expect(api.createDiscount).toHaveBeenCalledWith(
          'p1',
          expect.objectContaining({ label: 'Early bird', alwaysOn: true, houseIds: null, effect: { kind: 'percent', percent: 8 } }),
        ),
      );
      expect(await screen.findByText('Discount added')).toBeTruthy();
      expect(api.fetchDiscounts).toHaveBeenCalledTimes(2);
    });

    it('goes back to the form, unsaved, when the warning is cancelled', async () => {
      renderPanel();
      await screen.findByRole('table');
      await fillNew();
      await userEvent.click(screen.getByRole('button', { name: 'Add discount' }));

      await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

      expect(api.createDiscount).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog', { name: 'Apply this discount to every stay?' })).toBeNull();
      expect((screen.getByLabelText(/^Name/) as HTMLInputElement).value).toBe('Early bird');
    });

    it('shows the API message in the form when saving fails, and keeps what was typed', async () => {
      api.createDiscount.mockRejectedValue(new ApiRequestError('The discount rules are not valid', 400));
      renderPanel();
      await screen.findByRole('table');
      await fillNew();
      await userEvent.click(screen.getByRole('button', { name: 'Add discount' }));

      await userEvent.click(await screen.findByRole('button', { name: 'Apply to all stays' }));

      expect((await screen.findByRole('alert')).textContent).toContain('The discount rules are not valid');
      expect((screen.getByLabelText(/^Name/) as HTMLInputElement).value).toBe('Early bird');
    });

    it('updates an existing discount with no warning', async () => {
      api.updateDiscount.mockResolvedValue(LONG_STAY);
      renderPanel();
      await screen.findByRole('table');

      await userEvent.click(row('Long stay'));
      fireEvent.change(await screen.findByLabelText(/^Name/), { target: { value: 'Long stay plus' } });
      await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

      await waitFor(() => expect(api.updateDiscount).toHaveBeenCalledWith('long', expect.objectContaining({ label: 'Long stay plus' })));
      expect(screen.queryByRole('dialog', { name: 'Apply this discount to every stay?' })).toBeNull();
    });
  });
});

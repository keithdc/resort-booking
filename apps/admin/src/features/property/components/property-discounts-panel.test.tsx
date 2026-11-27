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
    promoted: false,
    oncePerGuest: false,
    redemptions: 0,
    ...overrides,
  };
}

const LONG_STAY = discount('long', { label: 'Long stay', redemptions: 3, maxRedemptions: 10, promoted: true });
const WELCOME = discount('welcome', {
  label: 'Welcome code',
  effect: { kind: 'fixed', amountCents: 2000 },
  conditions: [{ kind: 'promo_code', code: 'WELCOME15' }],
  houseIds: ['h1'],
  combinable: true,
  priority: 5,
  active: false,
});

const TODAY = '2026-11-25';

function renderPanel(): void {
  render(<PropertyDiscountsPanel propertyId="p1" houses={HOUSES} today={TODAY} />);
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
    expect(longStay).toContain('Automatic: the best one applies');
    expect(longStay).toContain('3 of 10 used');
    expect(longStay).toContain('Live');

    const welcome = plain(row('Welcome code').textContent);
    expect(welcome).toContain('20,00 €');
    expect(welcome).toContain('code WELCOME15');
    expect(welcome).toContain('Dune House');
    expect(welcome).not.toContain('Cedar Cabin');
    expect(welcome).toContain('Coupon: stacks after the automatic discount');
    expect(welcome).toContain('Unlimited');
    expect(welcome).toContain('Off');
  });

  it('shows a Used up chip only on a discount that has no uses left', async () => {
    api.fetchDiscounts.mockResolvedValue([
      discount('gone', { label: 'Gone', redemptions: 10, maxRedemptions: 10 }),
      discount('left', { label: 'Left', redemptions: 9, maxRedemptions: 10 }),
      discount('free', { label: 'Free', redemptions: 40, maxRedemptions: null }),
    ]);
    renderPanel();
    await screen.findByRole('table', { name: 'Discounts' });

    expect(plain(row('Gone').textContent)).toContain('10 of 10 used');
    expect(plain(row('Gone').textContent)).toContain('Used up');
    expect(plain(row('Left').textContent)).not.toContain('Used up');
    expect(plain(row('Free').textContent)).not.toContain('Used up');
  });

  describe('status and date wording', () => {
    const statusOf = (name: string): string | null => within(row(name)).getByText(/^(Live|Off|Ended|Used up|Starts .+)$/).textContent;

    it('shows ONE status per discount: Live, Starts, Ended, Used up or Off', async () => {
      api.fetchDiscounts.mockResolvedValue([
        discount('live', { label: 'Alive' }),
        discount('soon', { label: 'Soon', conditions: [{ kind: 'booking_window', startDate: '2026-12-01', endDate: '2026-12-31' }] }),
        discount('over', { label: 'Over', conditions: [{ kind: 'booking_window', startDate: '2026-10-01', endDate: '2026-11-24' }] }),
        discount('gone', { label: 'Gone', redemptions: 5, maxRedemptions: 5 }),
        discount('paused', { label: 'Paused', active: false }),
      ]);
      renderPanel();
      await screen.findByRole('table', { name: 'Discounts' });

      expect(statusOf('Alive')).toBe('Live');
      expect(statusOf('Soon')).toBe('Starts 1 Dec');
      expect(statusOf('Over')).toBe('Ended');
      expect(statusOf('Gone')).toBe('Used up');
      expect(statusOf('Paused')).toBe('Off');
      for (const name of ['Alive', 'Soon', 'Over', 'Gone', 'Paused']) {
        expect(within(row(name)).getAllByText(/^(Live|Off|Ended|Used up|Starts .+)$/)).toHaveLength(1);
      }
    });

    it('gives each status chip an icon, so colour is not the only signal', async () => {
      renderPanel();
      await screen.findByRole('table', { name: 'Discounts' });

      const chip = within(row('Long stay')).getByText('Live').closest('.MuiChip-root');
      expect(chip?.querySelector('svg')).not.toBeNull();
    });

    it('describes the dates in plain words, not "booked ..."', async () => {
      api.fetchDiscounts.mockResolvedValue([
        discount('test', {
          label: 'Test 15%',
          conditions: [
            { kind: 'min_nights', nights: 8 },
            { kind: 'booking_window', startDate: '2026-12-01', endDate: '2026-12-31' },
          ],
        }),
        discount('season', { label: 'Season', conditions: [{ kind: 'stay_dates', startDate: '2027-07-01', endDate: '2027-08-31' }] }),
        discount('early', { label: 'Early', conditions: [{ kind: 'booking_lead_days', minDays: 14, maxDays: null }] }),
      ]);
      renderPanel();
      await screen.findByRole('table', { name: 'Discounts' });

      expect(plain(row('Test 15%').textContent)).toContain('8+ nights; Book 1 Dec – 31 Dec 2026');
      expect(plain(row('Season').textContent)).toContain('Stays 1 Jul – 31 Aug 2027');
      expect(plain(row('Early').textContent)).toContain('Book 14+ days ahead');
      expect(plain(row('Test 15%').textContent)).not.toContain('booked');
    });

    it('opens the dialog with the run dates filled in and the not-started note', async () => {
      api.fetchDiscounts.mockResolvedValue([
        discount('test', {
          label: 'Test 15%',
          conditions: [
            { kind: 'min_nights', nights: 8 },
            { kind: 'booking_window', startDate: '2026-12-01', endDate: '2026-12-31' },
          ],
        }),
      ]);
      renderPanel();
      await screen.findByRole('table', { name: 'Discounts' });

      await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

      expect((screen.getByLabelText('Starts') as HTMLInputElement).value).toBe('2026-12-01');
      expect(screen.getByRole('alert').textContent).toContain('Starts in 6 days');
    });
  });

  it('marks only the advertised discounts as Promoted', async () => {
    renderPanel();
    await screen.findByRole('table', { name: 'Discounts' });

    expect(plain(row('Long stay').textContent)).toContain('Promoted');
    expect(plain(row('Welcome code').textContent)).not.toContain('Promoted');
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

  describe('filtering a long list', () => {
    const coupon = (id: string, label: string, code: string, overrides: Partial<Discount> = {}): Discount =>
      discount(id, { label, conditions: [{ kind: 'promo_code', code }], ...overrides });
    const many = (count: number): Discount[] => Array.from({ length: count }, (_, index) => coupon(`c${String(index)}`, `Guest code ${String(index).padStart(2, '0')}`, `ONE${String(index).padStart(3, '0')}`, { oncePerGuest: true }));
    const rowsOf = (): HTMLElement[] => within(screen.getByRole('table', { name: 'Discounts' })).getAllByRole('row').slice(1);
    const search = (): HTMLElement => screen.getByLabelText('Search by name or code');

    it('searches the name and the promo code, any case', async () => {
      api.fetchDiscounts.mockResolvedValue([LONG_STAY, WELCOME]);
      renderPanel();
      await screen.findByRole('table', { name: 'Discounts' });

      fireEvent.change(search(), { target: { value: 'welcome15' } });
      expect(rowsOf()).toHaveLength(1);
      expect(rowsOf()[0]?.textContent).toContain('Welcome code');

      fireEvent.change(search(), { target: { value: 'LONG' } });
      expect(rowsOf()).toHaveLength(1);
      expect(rowsOf()[0]?.textContent).toContain('Long stay');
    });

    it('filters by type and by status', async () => {
      api.fetchDiscounts.mockResolvedValue([LONG_STAY, WELCOME]);
      renderPanel();
      await screen.findByRole('table', { name: 'Discounts' });

      await userEvent.click(screen.getByRole('combobox', { name: 'Type' }));
      await userEvent.click(await screen.findByRole('option', { name: 'Coupons (with a code)' }));
      expect(rowsOf().map((entry) => entry.textContent)).toEqual([expect.stringContaining('Welcome code')]);

      await userEvent.click(screen.getByRole('combobox', { name: 'Type' }));
      await userEvent.click(await screen.findByRole('option', { name: 'Automatic' }));
      expect(rowsOf().map((entry) => entry.textContent)).toEqual([expect.stringContaining('Long stay')]);

      await userEvent.click(screen.getByRole('combobox', { name: 'Status' }));
      await userEvent.click(await screen.findByRole('option', { name: 'Off' }));
      expect(screen.getByText('No discounts match these filters')).toBeTruthy();
      expect(screen.queryByRole('table', { name: 'Discounts' })).toBeNull();
    });

    it('lists the live ones first, then those that start later, then the rest', async () => {
      const later = discount('later', { label: 'Summer sale', conditions: [{ kind: 'booking_window', startDate: '2027-06-01', endDate: '2027-06-30' }] });
      api.fetchDiscounts.mockResolvedValue([WELCOME, later, LONG_STAY]);
      renderPanel();
      await screen.findByRole('table', { name: 'Discounts' });

      expect(rowsOf().map((entry) => /Long stay|Summer sale|Welcome code/.exec(entry.textContent ?? '')?.[0])).toEqual(['Long stay', 'Summer sale', 'Welcome code']);
    });

    it('says how many show, and clears the filters', async () => {
      api.fetchDiscounts.mockResolvedValue([LONG_STAY, WELCOME]);
      renderPanel();
      await screen.findByRole('table', { name: 'Discounts' });
      expect(screen.getByRole('status').textContent).toBe('Showing 2 of 2');
      expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();

      fireEvent.change(search(), { target: { value: 'welcome' } });
      expect(screen.getByRole('status').textContent).toBe('Showing 1 of 1 matching, 2 in all');

      await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
      expect(rowsOf()).toHaveLength(2);
      expect((search() as HTMLInputElement).value).toBe('');
      expect(screen.queryByRole('button', { name: 'Clear filters' })).toBeNull();
    });

    it('shows the first 20 rows and adds 20 more at a time, so a long list never makes the page endless', async () => {
      api.fetchDiscounts.mockResolvedValue(many(87));
      renderPanel();
      await screen.findByRole('table', { name: 'Discounts' });

      expect(rowsOf()).toHaveLength(20);
      expect(screen.getByRole('status').textContent).toBe('Showing 20 of 87');
      await userEvent.click(screen.getByRole('button', { name: 'Show 20 more' }));
      expect(rowsOf()).toHaveLength(40);
      await userEvent.click(screen.getByRole('button', { name: 'Show 20 more' }));
      await userEvent.click(screen.getByRole('button', { name: 'Show 20 more' }));
      expect(rowsOf()).toHaveLength(80);
      await userEvent.click(screen.getByRole('button', { name: 'Show 7 more' }));
      expect(rowsOf()).toHaveLength(87);
      expect(screen.queryByRole('button', { name: /Show .* more/ })).toBeNull();
    });

    it('starts again at 20 rows when a filter changes', async () => {
      api.fetchDiscounts.mockResolvedValue(many(87));
      renderPanel();
      await screen.findByRole('table', { name: 'Discounts' });
      await userEvent.click(screen.getByRole('button', { name: 'Show 20 more' }));
      expect(rowsOf()).toHaveLength(40);

      fireEvent.change(search(), { target: { value: 'guest code' } });

      expect(rowsOf()).toHaveLength(20);
      expect(screen.getByRole('status').textContent).toBe('Showing 20 of 87 matching, 87 in all');
    });

    it('finds one code among many', async () => {
      api.fetchDiscounts.mockResolvedValue(many(87));
      renderPanel();
      await screen.findByRole('table', { name: 'Discounts' });

      fireEvent.change(search(), { target: { value: 'one042' } });

      expect(rowsOf()).toHaveLength(1);
      expect(rowsOf()[0]?.textContent).toContain('Guest code 42');
    });

    it('marks a coupon limited to once per guest and keeps the row actions working', async () => {
      api.fetchDiscounts.mockResolvedValue([coupon('o', 'Welcome code', 'WELCOME15', { oncePerGuest: true })]);
      api.deleteDiscount.mockResolvedValue(null);
      renderPanel();
      await screen.findByRole('table', { name: 'Discounts' });

      expect(rowsOf()[0]?.textContent).toContain('Once per guest');
      await userEvent.click(within(rowsOf()[0] as HTMLElement).getByRole('button', { name: 'Edit' }));
      expect(await screen.findByRole('dialog', { name: 'Edit discount' })).toBeTruthy();
    });

    it('shows no filter bar before there is a discount', async () => {
      api.fetchDiscounts.mockResolvedValue([]);
      renderPanel();
      await screen.findByText(/No discounts yet/);
      expect(screen.queryByLabelText('Search by name or code')).toBeNull();
    });
  });
});

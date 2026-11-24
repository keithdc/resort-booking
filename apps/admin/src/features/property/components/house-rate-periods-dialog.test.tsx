// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/property/components/house-rate-periods-dialog.test.tsx
 * @feature property
 */

import type {
  BulkRatePeriodPreview,
  BulkRatePeriodRequest,
  BulkRatePeriodResult,
  HouseSummary,
  RatePeriod,
  RatePeriodWrite,
} from '@resort-booking/shared-types';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/shared/services/api-client';
import { HouseRatePeriodsDialog } from './house-rate-periods-dialog';

const api = vi.hoisted(() => ({
  fetchRatePeriods: vi.fn<(houseId: string) => Promise<RatePeriod[]>>(),
  createRatePeriod: vi.fn<(houseId: string, body: RatePeriodWrite) => Promise<RatePeriod>>(),
  updateRatePeriod: vi.fn<(periodId: string, body: RatePeriodWrite) => Promise<RatePeriod>>(),
  deleteRatePeriod: vi.fn<(periodId: string) => Promise<null>>(),
  previewBulkRatePeriod: vi.fn<(propertyId: string, body: BulkRatePeriodRequest) => Promise<BulkRatePeriodPreview>>(),
  applyBulkRatePeriod: vi.fn<(propertyId: string, body: BulkRatePeriodRequest) => Promise<BulkRatePeriodResult>>(),
}));

vi.mock('../services/staff-rates-api', () => api);

const HOUSE: HouseSummary = {
  id: 'h1',
  organizationId: 'o',
  propertyId: 'p1',
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
  nightlyRateCents: 24000,
  currencyCode: 'EUR',
  coverPhotoUrl: null,
  mapLatitude: 45.9,
  mapLongitude: 6.1,
};

const PEAK: RatePeriod = {
  id: 'a',
  houseId: 'h1',
  propertyId: 'p1',
  label: 'Peak summer',
  startDate: '2027-07-01',
  endDate: '2027-08-31',
  nightlyRateCents: 31200,
};

const CLASH_PREVIEW: BulkRatePeriodPreview = {
  propertyId: 'p1',
  addCount: 1,
  conflictCount: 1,
  results: [
    { houseId: 'h1', houseName: 'Dune House', status: 'will_add', conflict: null },
    { houseId: 'h2', houseName: 'Cedar Cabin', status: 'conflict', conflict: { label: 'Existing peak', startDate: '2027-07-15', endDate: '2027-07-20' } },
  ],
};

function renderDialog(): void {
  render(<HouseRatePeriodsDialog open house={HOUSE} propertyId="p1" allHouseIds={['h1', 'h2']} onClose={vi.fn<() => void>()} />);
}

function fillForm(overrides: { label?: string; start?: string; end?: string; euros?: string } = {}): void {
  fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: overrides.label ?? 'Autumn' } });
  fireEvent.change(screen.getByLabelText(/^First night/), { target: { value: overrides.start ?? '2027-10-01' } });
  fireEvent.change(screen.getByLabelText(/^Last night/), { target: { value: overrides.end ?? '2027-10-10' } });
  fireEvent.change(screen.getByLabelText(/^Per night/), { target: { value: overrides.euros ?? '280' } });
}

function addButton(name: string | RegExp = 'Add seasonal rate'): HTMLElement {
  return screen.getByRole('button', { name });
}

describe('HouseRatePeriodsDialog', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.fetchRatePeriods.mockResolvedValue([PEAK]);
  });

  afterEach(cleanup);

  it('explains the standard rate and lists existing seasons', async () => {
    renderDialog();

    const table = await screen.findByRole('table', { name: 'Seasonal rates' });
    expect(table.textContent).toContain('Peak summer');
    expect(table.textContent).toContain('2027-07-01');
    expect(screen.getByRole('dialog', { name: /Seasonal rates/ }).textContent).toContain('Standard rate: 240,00');
  });

  it('shows a friendly empty state when there are no seasons', async () => {
    api.fetchRatePeriods.mockResolvedValue([]);

    renderDialog();

    expect(await screen.findByText(/No seasonal rates yet/)).toBeTruthy();
  });

  it('keeps Add disabled until the form is complete', async () => {
    renderDialog();
    await screen.findByRole('table');
    expect(addButton().hasAttribute('disabled')).toBe(true);

    fillForm();

    expect(addButton().hasAttribute('disabled')).toBe(false);
  });

  it('blocks a last night before the first night and says why', async () => {
    renderDialog();
    await screen.findByRole('table');

    fillForm({ start: '2027-10-10', end: '2027-10-01' });

    expect(screen.getByText('Cannot be before the first night')).toBeTruthy();
    expect(addButton().hasAttribute('disabled')).toBe(true);
  });

  it('allows past dates, because staff may correct history', async () => {
    api.createRatePeriod.mockResolvedValue(PEAK);
    renderDialog();
    await screen.findByRole('table');
    fillForm({ start: '2019-01-01', end: '2019-01-05' });

    await userEvent.click(addButton());

    expect(api.createRatePeriod).toHaveBeenCalledWith('h1', expect.objectContaining({ startDate: '2019-01-01' }));
  });

  it('adds a period with the euro amount converted to cents', async () => {
    api.createRatePeriod.mockResolvedValue(PEAK);
    renderDialog();
    await screen.findByRole('table');
    fillForm();

    await userEvent.click(addButton());

    expect(api.createRatePeriod).toHaveBeenCalledWith('h1', {
      label: 'Autumn',
      startDate: '2027-10-01',
      endDate: '2027-10-10',
      nightlyRateCents: 28000,
    });
    expect(await screen.findByText('Seasonal rate added')).toBeTruthy();
  });

  it('shows the overlap message naming the clashing season and keeps the form', async () => {
    api.createRatePeriod.mockRejectedValue(
      new ApiRequestError('These dates overlap "Peak summer" (2027-07-01 to 2027-08-31). Change one of the two ranges.', 409),
    );
    renderDialog();
    await screen.findByRole('table');
    fillForm({ start: '2027-07-10', end: '2027-07-12' });

    await userEvent.click(addButton());

    expect((await screen.findByRole('alert')).textContent).toContain('overlap "Peak summer"');
    expect((screen.getByLabelText(/^Name/) as HTMLInputElement).value).toBe('Autumn');
  });

  it('edits a season in place', async () => {
    api.updateRatePeriod.mockResolvedValue(PEAK);
    renderDialog();
    await screen.findByRole('table');

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect((screen.getByLabelText(/^Name/) as HTMLInputElement).value).toBe('Peak summer');
    expect(screen.queryByLabelText('Apply to all stays at this property')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(api.updateRatePeriod).toHaveBeenCalledWith('a', expect.objectContaining({ nightlyRateCents: 31200 }));
  });

  describe('delete', () => {
    it('asks before removing and keeps the season if the person backs out', async () => {
      renderDialog();
      await screen.findByRole('table');

      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Keep it' }));

      expect(api.deleteRatePeriod).not.toHaveBeenCalled();
    });

    it('removes the season once confirmed', async () => {
      api.deleteRatePeriod.mockResolvedValue(null);
      renderDialog();
      await screen.findByRole('table');

      await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
      await userEvent.click(await screen.findByRole('button', { name: 'Remove' }));

      await waitFor(() => expect(api.deleteRatePeriod).toHaveBeenCalledWith('a'));
    });
  });

  describe('apply to all houses', () => {
    async function reachWarning(): Promise<void> {
      api.previewBulkRatePeriod.mockResolvedValue(CLASH_PREVIEW);
      renderDialog();
      await screen.findByRole('table');
      fillForm();
      await userEvent.click(screen.getByLabelText('Apply to all stays at this property'));
      await userEvent.click(addButton('Review…'));
    }

    it('shows the warning with the houses that clash instead of saving straight away', async () => {
      await reachWarning();

      const warning = await screen.findByRole('dialog', { name: /Change the price of 2 stays at once/ });
      expect(within(warning).getByRole('list', { name: 'Stays that will be skipped' }).textContent).toContain('Cedar Cabin');
      expect(api.previewBulkRatePeriod).toHaveBeenCalledWith('p1', expect.objectContaining({ houseIds: ['h1', 'h2'], confirmed: false }));
      expect(api.applyBulkRatePeriod).not.toHaveBeenCalled();
      expect(api.createRatePeriod).not.toHaveBeenCalled();
    });

    it('writes nothing when the warning is cancelled', async () => {
      await reachWarning();

      await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

      expect(api.applyBulkRatePeriod).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog', { name: /Change the price/ })).toBeNull();
    });

    it('applies with confirmed true once the person agrees, then reports what was skipped', async () => {
      api.applyBulkRatePeriod.mockResolvedValue({ propertyId: 'p1', addedHouseIds: ['h1'], skippedHouseIds: ['h2'] });
      await reachWarning();

      await userEvent.click(await screen.findByRole('button', { name: 'Add to 1 stay' }));

      await waitFor(() =>
        expect(api.applyBulkRatePeriod).toHaveBeenCalledWith('p1', expect.objectContaining({ houseIds: ['h1', 'h2'], confirmed: true })),
      );
      expect(await screen.findByText('Added to 1 stay, skipped 1 with a date clash')).toBeTruthy();
    });
  });
});

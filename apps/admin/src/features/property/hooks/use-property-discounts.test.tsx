// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/property/hooks/use-property-discounts.test.tsx
 * @feature property
 */

import type { Discount, DiscountWrite } from '@resort-booking/shared-types';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/shared/services/api-client';
import { usePropertyDiscounts } from './use-property-discounts';

const api = vi.hoisted(() => ({
  fetchDiscounts: vi.fn<(propertyId: string) => Promise<Discount[]>>(),
  createDiscount: vi.fn<(propertyId: string, body: DiscountWrite) => Promise<Discount>>(),
  updateDiscount: vi.fn<(discountId: string, body: DiscountWrite) => Promise<Discount>>(),
  deleteDiscount: vi.fn<(discountId: string) => Promise<null>>(),
}));

vi.mock('../services/staff-discounts-api', () => api);

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

function setup(): ReturnType<typeof renderHook<ReturnType<typeof usePropertyDiscounts>, undefined>> {
  return renderHook(() => usePropertyDiscounts('p1'));
}

/** Opens the create form and fills a valid draft. */
async function fillValid(
  result: ReturnType<typeof setup>['result'],
  patch: Parameters<ReturnType<typeof setup>['result']['current']['updateDraft']>[0] = {},
): Promise<void> {
  act(() => result.current.openCreate());
  act(() =>
    result.current.updateDraft({ label: 'Long stay', value: '10', minNightsOn: true, minNights: '7', ...patch }),
  );
}

describe('usePropertyDiscounts', () => {
  beforeEach(() => {
    Object.values(api).forEach((mock) => mock.mockReset());
    api.fetchDiscounts.mockResolvedValue([]);
  });

  afterEach(cleanup);

  it('loads the discounts for the property', async () => {
    api.fetchDiscounts.mockResolvedValue([discount('a')]);

    const { result } = setup();

    await waitFor(() => expect(result.current.discounts).toHaveLength(1));
    expect(api.fetchDiscounts).toHaveBeenCalledWith('p1');
    expect(result.current.loading).toBe(false);
  });

  it('shows a readable error when loading fails', async () => {
    api.fetchDiscounts.mockRejectedValue(new ApiRequestError('boom', 500));

    const { result } = setup();

    await waitFor(() => expect(result.current.error).toBe('boom'));
    expect(result.current.loading).toBe(false);
  });

  it('opens an empty form for a new discount and a filled one for an edit', async () => {
    const { result } = setup();
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.openCreate());
    expect(result.current.formOpen).toBe(true);
    expect(result.current.editingId).toBeNull();
    expect(result.current.draft.label).toBe('');

    act(() => result.current.openEdit(discount('a', { label: 'Early bird', priority: 7 })));
    expect(result.current.editingId).toBe('a');
    expect(result.current.draft).toMatchObject({ label: 'Early bird', priority: '7' });
  });

  describe('create', () => {
    it('saves a discount limited to chosen houses without asking for confirmation', async () => {
      api.createDiscount.mockResolvedValue(discount('new'));
      const { result } = setup();
      await waitFor(() => expect(result.current.loading).toBe(false));
      await fillValid(result, { scope: 'chosen', houseIds: ['h1'] });

      await act(async () => {
        await result.current.save();
      });

      expect(api.createDiscount).toHaveBeenCalledWith(
        'p1',
        expect.objectContaining({ label: 'Long stay', houseIds: ['h1'], effect: { kind: 'percent', percent: 10 } }),
      );
      expect(result.current.notice).toBe('Discount added');
      expect(result.current.formOpen).toBe(false);
      expect(api.fetchDiscounts).toHaveBeenCalledTimes(2);
    });

    it('does not call the API for an invalid draft', async () => {
      const { result } = setup();
      await waitFor(() => expect(result.current.loading).toBe(false));
      await fillValid(result, { label: '' });

      await act(async () => {
        await result.current.save();
      });

      expect(api.createDiscount).not.toHaveBeenCalled();
      expect(result.current.allHousesWarning).toBe(false);
      expect(result.current.formOpen).toBe(true);
    });

    it('keeps the form open and filled, showing the API message, when saving fails', async () => {
      api.createDiscount.mockRejectedValue(new ApiRequestError('One of the houses does not belong to this property', 400));
      const { result } = setup();
      await waitFor(() => expect(result.current.loading).toBe(false));
      await fillValid(result, { scope: 'chosen', houseIds: ['stranger'] });

      await act(async () => {
        await result.current.save();
      });

      expect(result.current.error).toBe('One of the houses does not belong to this property');
      expect(result.current.formOpen).toBe(true);
      expect(result.current.draft.label).toBe('Long stay');
      expect(result.current.saving).toBe(false);
    });
  });

  describe('a new discount for all houses', () => {
    it('asks for confirmation first and writes nothing yet', async () => {
      const { result } = setup();
      await waitFor(() => expect(result.current.loading).toBe(false));
      await fillValid(result, { scope: 'all' });

      await act(async () => {
        await result.current.save();
      });

      expect(result.current.allHousesWarning).toBe(true);
      expect(api.createDiscount).not.toHaveBeenCalled();
    });

    it('saves once confirmed', async () => {
      api.createDiscount.mockResolvedValue(discount('new'));
      const { result } = setup();
      await waitFor(() => expect(result.current.loading).toBe(false));
      await fillValid(result, { scope: 'all' });
      await act(async () => {
        await result.current.save();
      });

      await act(async () => {
        await result.current.confirmAllHouses();
      });

      expect(api.createDiscount).toHaveBeenCalledWith('p1', expect.objectContaining({ houseIds: null }));
      expect(result.current.allHousesWarning).toBe(false);
      expect(result.current.notice).toBe('Discount added');
    });

    it('writes nothing and keeps the form when cancelled', async () => {
      const { result } = setup();
      await waitFor(() => expect(result.current.loading).toBe(false));
      await fillValid(result, { scope: 'all' });
      await act(async () => {
        await result.current.save();
      });

      act(() => result.current.cancelAllHouses());

      expect(result.current.allHousesWarning).toBe(false);
      expect(result.current.formOpen).toBe(true);
      expect(api.createDiscount).not.toHaveBeenCalled();
    });

    it('closes the warning and shows the error when the confirmed save fails', async () => {
      api.createDiscount.mockRejectedValue(new ApiRequestError('The discount rules are not valid', 400));
      const { result } = setup();
      await waitFor(() => expect(result.current.loading).toBe(false));
      await fillValid(result, { scope: 'all' });
      await act(async () => {
        await result.current.save();
      });

      await act(async () => {
        await result.current.confirmAllHouses();
      });

      expect(result.current.allHousesWarning).toBe(false);
      expect(result.current.error).toBe('The discount rules are not valid');
    });
  });

  describe('edit', () => {
    it('updates without a warning, even when it applies to all houses', async () => {
      api.updateDiscount.mockResolvedValue(discount('a'));
      const { result } = setup();
      await waitFor(() => expect(result.current.loading).toBe(false));
      act(() => result.current.openEdit(discount('a', { houseIds: null })));
      act(() => result.current.updateDraft({ label: 'Renamed' }));

      await act(async () => {
        await result.current.save();
      });

      expect(result.current.allHousesWarning).toBe(false);
      expect(api.updateDiscount).toHaveBeenCalledWith('a', expect.objectContaining({ label: 'Renamed' }));
      expect(api.createDiscount).not.toHaveBeenCalled();
      expect(result.current.notice).toBe('Discount updated');
    });
  });

  describe('remove', () => {
    it('deletes and reloads', async () => {
      api.deleteDiscount.mockResolvedValue(null);
      const { result } = setup();
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.remove('a');
      });

      expect(api.deleteDiscount).toHaveBeenCalledWith('a');
      expect(result.current.notice).toBe('Discount removed');
      expect(api.fetchDiscounts).toHaveBeenCalledTimes(2);
    });

    it('shows an error when the delete fails', async () => {
      api.deleteDiscount.mockRejectedValue(new ApiRequestError('Discount not found', 404));
      const { result } = setup();
      await waitFor(() => expect(result.current.loading).toBe(false));

      await act(async () => {
        await result.current.remove('a');
      });

      expect(result.current.error).toBe('Discount not found');
    });
  });
});

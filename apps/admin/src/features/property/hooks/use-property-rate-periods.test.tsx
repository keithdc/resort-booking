// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/property/hooks/use-property-rate-periods.test.tsx
 * @feature property
 */

import type { RatePeriod } from '@resort-booking/shared-types';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePropertyRatePeriods } from './use-property-rate-periods';

const api = vi.hoisted(() => ({
  fetchPropertyRatePeriods: vi.fn<(propertyId: string) => Promise<RatePeriod[]>>(),
}));

vi.mock('../services/staff-rates-api', () => api);

function period(id: string, houseId: string, startDate: string): RatePeriod {
  return { id, houseId, propertyId: 'p1', label: id, startDate, endDate: startDate, nightlyRateCents: 100 };
}

describe('usePropertyRatePeriods', () => {
  beforeEach(() => {
    api.fetchPropertyRatePeriods.mockReset();
  });

  afterEach(cleanup);

  it('loads every house with ONE request and groups the periods by house, keeping date order', async () => {
    api.fetchPropertyRatePeriods.mockResolvedValue([
      period('a', 'h1', '2027-01-01'),
      period('b', 'h1', '2027-07-01'),
      period('c', 'h2', '2027-03-01'),
    ]);

    const { result } = renderHook(() => usePropertyRatePeriods('p1'));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(api.fetchPropertyRatePeriods).toHaveBeenCalledTimes(1);
    expect(result.current.byHouse.get('h1')?.map((p) => p.id)).toEqual(['a', 'b']);
    expect(result.current.byHouse.get('h2')?.map((p) => p.id)).toEqual(['c']);
    expect(result.current.byHouse.get('h3')).toBeUndefined();
  });

  it('reports a failure and keeps working with no periods', async () => {
    api.fetchPropertyRatePeriods.mockRejectedValue(new Error('down'));

    const { result } = renderHook(() => usePropertyRatePeriods('p1'));

    await waitFor(() => expect(result.current.failed).toBe(true));
    expect(result.current.loading).toBe(false);
    expect(result.current.byHouse.size).toBe(0);
  });

  it('reloads after a change and shows the new list', async () => {
    api.fetchPropertyRatePeriods.mockResolvedValueOnce([period('a', 'h1', '2027-01-01')]).mockResolvedValueOnce([]);
    const { result } = renderHook(() => usePropertyRatePeriods('p1'));
    await waitFor(() => expect(result.current.byHouse.get('h1')).toHaveLength(1));

    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.byHouse.get('h1')).toBeUndefined();
    expect(api.fetchPropertyRatePeriods).toHaveBeenCalledTimes(2);
  });
});

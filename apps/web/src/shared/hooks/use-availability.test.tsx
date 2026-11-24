// @vitest-environment jsdom
/**
 * @file apps/web/src/shared/hooks/use-availability.test.tsx
 * @shared Booked-date hooks
 */

import type { HouseAvailability, PropertyAvailability } from '@resort-booking/shared-types';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHouseAvailability, usePropertyUnavailable } from './use-availability';

const api = vi.hoisted(() => ({
  fetchHouseAvailability: vi.fn<
    (property: string, house: string, options?: { checkIn?: string }) => Promise<HouseAvailability>
  >(),
  fetchPropertyAvailability: vi.fn<(property: string) => Promise<PropertyAvailability>>(),
}));

vi.mock('../services/availability-api', () => api);

function houseResult(overrides: Partial<HouseAvailability>): HouseAvailability {
  return {
    houseId: 'h',
    from: '2027-06-01',
    to: '2028-06-01',
    unavailable: [],
    maxCheckOutDate: null,
    ...overrides,
  };
}

afterEach(cleanup);

describe('usePropertyUnavailable', (): void => {
  beforeEach((): void => {
    api.fetchPropertyAvailability.mockReset();
  });

  it('does not call the API when no property is chosen', async (): Promise<void> => {
    const { result } = renderHook(() => usePropertyUnavailable(null));

    await waitFor((): void => {
      expect(result.current.loading).toBe(false);
    });
    expect(api.fetchPropertyAvailability).not.toHaveBeenCalled();
    expect(result.current.unavailable).toEqual([]);
  });

  it('returns the fully booked nights from the API', async (): Promise<void> => {
    api.fetchPropertyAvailability.mockResolvedValue({
      propertyId: 'p',
      from: '2027-06-01',
      to: '2028-06-01',
      fullyBookedNights: [{ startDate: '2027-06-10', endDate: '2027-06-12' }],
    });

    const { result } = renderHook(() => usePropertyUnavailable('alpine-lake'));

    await waitFor((): void => {
      expect(result.current.unavailable).toHaveLength(1);
    });
    expect(result.current.failed).toBe(false);
    expect(api.fetchPropertyAvailability).toHaveBeenCalledWith('alpine-lake');
  });

  it('stays usable with no disabled dates when the request fails', async (): Promise<void> => {
    api.fetchPropertyAvailability.mockRejectedValue(new Error('network down'));

    const { result } = renderHook(() => usePropertyUnavailable('alpine-lake'));

    await waitFor((): void => {
      expect(result.current.failed).toBe(true);
    });
    expect(result.current.unavailable).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('refetches when refresh is called', async (): Promise<void> => {
    api.fetchPropertyAvailability.mockResolvedValue({
      propertyId: 'p',
      from: 'a',
      to: 'b',
      fullyBookedNights: [],
    });
    const { result } = renderHook(() => usePropertyUnavailable('alpine-lake'));
    await waitFor((): void => {
      expect(result.current.loading).toBe(false);
    });

    act((): void => {
      result.current.refresh();
    });

    await waitFor((): void => {
      expect(api.fetchPropertyAvailability).toHaveBeenCalledTimes(2);
    });
  });
});

describe('useHouseAvailability', (): void => {
  beforeEach((): void => {
    api.fetchHouseAvailability.mockReset();
  });

  it('loads ranges once without a check-in and reports no check-out limit', async (): Promise<void> => {
    api.fetchHouseAvailability.mockResolvedValue(
      houseResult({ unavailable: [{ startDate: '2027-06-10', endDate: '2027-06-14' }] }),
    );

    const { result } = renderHook(() => useHouseAvailability('alpine-lake', 'lake-chalet', ''));

    await waitFor((): void => {
      expect(result.current.unavailable).toHaveLength(1);
    });
    expect(result.current.maxCheckOutDate).toBeNull();
    expect(api.fetchHouseAvailability).toHaveBeenCalledTimes(1);
  });

  it('asks for the latest check-out once a check-in is chosen', async (): Promise<void> => {
    api.fetchHouseAvailability.mockImplementation((_property, _house, options) =>
      Promise.resolve(houseResult({ maxCheckOutDate: options?.checkIn === undefined ? null : '2027-06-20' })),
    );

    const { result } = renderHook(() => useHouseAvailability('alpine-lake', 'lake-chalet', '2027-06-15'));

    await waitFor((): void => {
      expect(result.current.maxCheckOutDate).toBe('2027-06-20');
    });
    expect(api.fetchHouseAvailability).toHaveBeenCalledWith('alpine-lake', 'lake-chalet', {
      checkIn: '2027-06-15',
    });
  });

  it('keeps the ranges and clears the limit when the check-in lookup is rejected', async (): Promise<void> => {
    api.fetchHouseAvailability.mockImplementation((_property, _house, options) =>
      options?.checkIn === undefined
        ? Promise.resolve(houseResult({ unavailable: [{ startDate: '2027-06-10', endDate: '2027-06-14' }] }))
        : Promise.reject(new Error('CHECK_IN_UNAVAILABLE')),
    );

    const { result } = renderHook(() => useHouseAvailability('alpine-lake', 'lake-chalet', '2027-06-11'));

    await waitFor((): void => {
      expect(result.current.unavailable).toHaveLength(1);
    });
    expect(result.current.maxCheckOutDate).toBeNull();
    expect(result.current.failed).toBe(false);
  });

  it('drops the limit when the check-in is cleared', async (): Promise<void> => {
    api.fetchHouseAvailability.mockImplementation((_property, _house, options) =>
      Promise.resolve(houseResult({ maxCheckOutDate: options?.checkIn === undefined ? null : '2027-06-20' })),
    );
    const { result, rerender } = renderHook(
      ({ checkIn }: { checkIn: string }) => useHouseAvailability('alpine-lake', 'lake-chalet', checkIn),
      { initialProps: { checkIn: '2027-06-15' } },
    );
    await waitFor((): void => {
      expect(result.current.maxCheckOutDate).toBe('2027-06-20');
    });

    rerender({ checkIn: '' });

    await waitFor((): void => {
      expect(result.current.maxCheckOutDate).toBeNull();
    });
  });
});

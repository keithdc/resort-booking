/**
 * @file apps/web/src/shared/hooks/use-availability.ts
 * @shared Loads booked dates for guest pickers
 * @dependencies availability-api
 */

'use client';

import type { DateRange } from '@resort-booking/shared-types';
import { useCallback, useEffect, useState } from 'react';
import { fetchHouseAvailability, fetchPropertyAvailability } from '../services/availability-api';

export interface UnavailableRanges {
  unavailable: DateRange[];
  /** True while the first load is in flight. */
  loading: boolean;
  /** True when the load failed. The picker stays usable; the API still checks every quote. */
  failed: boolean;
  /** Reloads the ranges (holds expire, other guests book). Call when a picker opens. */
  refresh: () => void;
}

export interface HouseAvailabilityState extends UnavailableRanges {
  /** Latest valid check-out for the chosen check-in, or null when unknown. */
  maxCheckOutDate: string | null;
}

/**
 * Nights when every house at the property is taken. Pass null to skip (all-properties search).
 */
export function usePropertyUnavailable(propertySlug: string | null): UnavailableRanges {
  const load = useCallback(async (): Promise<DateRange[]> => {
    if (propertySlug === null) {
      return [];
    }
    return (await fetchPropertyAvailability(propertySlug)).fullyBookedNights;
  }, [propertySlug]);
  return useRanges(propertySlug !== null, load);
}

/**
 * Unavailable ranges for one house, plus the latest check-out once a check-in is chosen.
 */
export function useHouseAvailability(
  propertySlug: string,
  houseSlug: string,
  checkIn: string | null,
): HouseAvailabilityState {
  const load = useCallback(async (): Promise<DateRange[]> => {
    return (await fetchHouseAvailability(propertySlug, houseSlug)).unavailable;
  }, [propertySlug, houseSlug]);
  const ranges = useRanges(true, load);

  const [maxCheckOutDate, setMaxCheckOutDate] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect((): (() => void) => {
    let cancelled = false;
    if (checkIn === null || checkIn === '') {
      setMaxCheckOutDate(null);
      return (): void => {
        cancelled = true;
      };
    }
    fetchHouseAvailability(propertySlug, houseSlug, { checkIn })
      .then((result): void => {
        if (!cancelled) {
          setMaxCheckOutDate(result.maxCheckOutDate);
        }
      })
      .catch((): void => {
        // A taken or out-of-window check-in has no limit to show; the quote reports the problem.
        if (!cancelled) {
          setMaxCheckOutDate(null);
        }
      });
    return (): void => {
      cancelled = true;
    };
  }, [propertySlug, houseSlug, checkIn, version]);

  const refresh = useCallback((): void => {
    ranges.refresh();
    setVersion((current): number => current + 1);
  }, [ranges]);

  return { ...ranges, refresh, maxCheckOutDate };
}

function useRanges(enabled: boolean, load: () => Promise<DateRange[]>): UnavailableRanges {
  const [unavailable, setUnavailable] = useState<DateRange[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [failed, setFailed] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect((): (() => void) => {
    let cancelled = false;
    if (!enabled) {
      setUnavailable([]);
      setLoading(false);
      setFailed(false);
      return (): void => {
        cancelled = true;
      };
    }
    setLoading(true);
    load()
      .then((ranges): void => {
        if (!cancelled) {
          setUnavailable(ranges);
          setFailed(false);
        }
      })
      .catch((): void => {
        if (!cancelled) {
          setUnavailable([]);
          setFailed(true);
        }
      })
      .finally((): void => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return (): void => {
      cancelled = true;
    };
  }, [enabled, load, version]);

  const refresh = useCallback((): void => {
    setVersion((current): number => current + 1);
  }, []);

  return { unavailable, loading, failed, refresh };
}

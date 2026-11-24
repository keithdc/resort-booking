/**
 * @file apps/admin/src/features/property/hooks/use-property-rate-periods.ts
 * @feature property
 * @dependencies staff-rates-api
 */

'use client';

import type { RatePeriod } from '@resort-booking/shared-types';
import { useCallback, useEffect, useState } from 'react';
import { fetchPropertyRatePeriods } from '../services/staff-rates-api';

export interface PropertyRatePeriodsState {
  /** Periods per house id, each in date order. A house with none has no entry. */
  byHouse: ReadonlyMap<string, RatePeriod[]>;
  loading: boolean;
  failed: boolean;
  /** Reloads after staff add, edit, or remove a season. */
  reload: () => Promise<void>;
}

/**
 * Loads every house's seasons at a property with a single request, for the houses list.
 */
export function usePropertyRatePeriods(propertyId: string): PropertyRatePeriodsState {
  const [byHouse, setByHouse] = useState<ReadonlyMap<string, RatePeriod[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const reload = useCallback(async (): Promise<void> => {
    try {
      const periods = await fetchPropertyRatePeriods(propertyId);
      const grouped = new Map<string, RatePeriod[]>();
      for (const period of periods) {
        const list = grouped.get(period.houseId);
        if (list === undefined) {
          grouped.set(period.houseId, [period]);
        } else {
          list.push(period);
        }
      }
      setByHouse(grouped);
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect((): void => {
    void reload();
  }, [reload]);

  return { byHouse, loading, failed, reload };
}

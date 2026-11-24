/**
 * @file apps/admin/src/features/property/hooks/use-house-rate-periods.ts
 * @feature property
 * @dependencies staff-rates-api, money
 */

'use client';

import type { BulkRatePeriodPreview, RatePeriod, RatePeriodWrite } from '@resort-booking/shared-types';
import { useCallback, useEffect, useState } from 'react';
import { ApiRequestError } from '@/shared/services/api-client';
import { centsFromEuroInput, eurosInputFromCents } from '@/shared/utils/money';
import {
  applyBulkRatePeriod,
  createRatePeriod,
  deleteRatePeriod,
  fetchRatePeriods,
  previewBulkRatePeriod,
  updateRatePeriod,
} from '../services/staff-rates-api';

export interface RatePeriodDraft {
  /** Null while adding a new period. */
  id: string | null;
  label: string;
  startDate: string;
  endDate: string;
  euros: string;
  applyToAll: boolean;
}

export interface BulkWarning {
  preview: BulkRatePeriodPreview;
  write: RatePeriodWrite;
}

export interface UseHouseRatePeriodsOptions {
  houseId: string | null;
  propertyId: string;
  /** Every house at the property, for "apply to all houses". */
  allHouseIds: readonly string[];
  open: boolean;
}

export interface HouseRatePeriodsState {
  periods: RatePeriod[];
  loading: boolean;
  saving: boolean;
  error: string | null;
  notice: string | null;
  draft: RatePeriodDraft;
  bulkWarning: BulkWarning | null;
  updateDraft: (patch: Partial<RatePeriodDraft>) => void;
  startEdit: (period: RatePeriod) => void;
  resetDraft: () => void;
  save: () => Promise<void>;
  remove: (periodId: string) => Promise<void>;
  confirmBulk: () => Promise<void>;
  cancelBulk: () => void;
  clearNotice: () => void;
}

const EMPTY_DRAFT: RatePeriodDraft = {
  id: null,
  label: '',
  startDate: '',
  endDate: '',
  euros: '',
  applyToAll: false,
};

/**
 * Loads and edits seasonal periods for one house. Applying to every house goes through a
 * preview and a warning first; nothing is written until the person confirms.
 */
export function useHouseRatePeriods({
  houseId,
  propertyId,
  allHouseIds,
  open,
}: UseHouseRatePeriodsOptions): HouseRatePeriodsState {
  const [periods, setPeriods] = useState<RatePeriod[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<RatePeriodDraft>(EMPTY_DRAFT);
  const [bulkWarning, setBulkWarning] = useState<BulkWarning | null>(null);

  const reload = useCallback(async (): Promise<void> => {
    if (houseId === null) {
      return;
    }
    setLoading(true);
    try {
      setPeriods(await fetchRatePeriods(houseId));
    } catch (failure: unknown) {
      setError(messageOf(failure, 'Could not load the seasonal rates'));
    } finally {
      setLoading(false);
    }
  }, [houseId]);

  useEffect((): void => {
    if (open) {
      setError(null);
      setNotice(null);
      setDraft(EMPTY_DRAFT);
      setBulkWarning(null);
      void reload();
    }
  }, [open, reload]);

  const updateDraft = useCallback((patch: Partial<RatePeriodDraft>): void => {
    setDraft((current): RatePeriodDraft => ({ ...current, ...patch }));
  }, []);

  const startEdit = useCallback((period: RatePeriod): void => {
    setError(null);
    setDraft({
      id: period.id,
      label: period.label,
      startDate: period.startDate,
      endDate: period.endDate,
      euros: eurosInputFromCents(period.nightlyRateCents),
      applyToAll: false,
    });
  }, []);

  const resetDraft = useCallback((): void => {
    setError(null);
    setDraft(EMPTY_DRAFT);
  }, []);

  const save = useCallback(async (): Promise<void> => {
    if (houseId === null) {
      return;
    }
    const write = toWrite(draft);
    setSaving(true);
    setError(null);
    try {
      if (draft.id === null && draft.applyToAll) {
        const preview = await previewBulkRatePeriod(propertyId, {
          ...write,
          houseIds: [...allHouseIds],
          confirmed: false,
        });
        setBulkWarning({ preview, write });
        return;
      }
      if (draft.id === null) {
        await createRatePeriod(houseId, write);
        setNotice('Seasonal rate added');
      } else {
        await updateRatePeriod(draft.id, write);
        setNotice('Seasonal rate updated');
      }
      setDraft(EMPTY_DRAFT);
      await reload();
    } catch (failure: unknown) {
      setError(messageOf(failure, 'Could not save the seasonal rate'));
    } finally {
      setSaving(false);
    }
  }, [allHouseIds, draft, houseId, propertyId, reload]);

  const confirmBulk = useCallback(async (): Promise<void> => {
    if (bulkWarning === null) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await applyBulkRatePeriod(propertyId, {
        ...bulkWarning.write,
        houseIds: [...allHouseIds],
        confirmed: true,
      });
      const skipped = result.skippedHouseIds.length;
      setNotice(
        `Added to ${String(result.addedHouseIds.length)} stay${result.addedHouseIds.length === 1 ? '' : 's'}` +
          (skipped > 0 ? `, skipped ${String(skipped)} with a date clash` : ''),
      );
      setBulkWarning(null);
      setDraft(EMPTY_DRAFT);
      await reload();
    } catch (failure: unknown) {
      setBulkWarning(null);
      setError(messageOf(failure, 'Could not apply the seasonal rate to every stay'));
    } finally {
      setSaving(false);
    }
  }, [allHouseIds, bulkWarning, propertyId, reload]);

  const cancelBulk = useCallback((): void => {
    setBulkWarning(null);
  }, []);

  const remove = useCallback(
    async (periodId: string): Promise<void> => {
      setSaving(true);
      setError(null);
      try {
        await deleteRatePeriod(periodId);
        setNotice('Seasonal rate removed');
        await reload();
      } catch (failure: unknown) {
        setError(messageOf(failure, 'Could not remove the seasonal rate'));
      } finally {
        setSaving(false);
      }
    },
    [reload],
  );

  const clearNotice = useCallback((): void => {
    setNotice(null);
  }, []);

  return {
    periods,
    loading,
    saving,
    error,
    notice,
    draft,
    bulkWarning,
    updateDraft,
    startEdit,
    resetDraft,
    save,
    remove,
    confirmBulk,
    cancelBulk,
    clearNotice,
  };
}

function toWrite(draft: RatePeriodDraft): RatePeriodWrite {
  return {
    label: draft.label.trim(),
    startDate: draft.startDate,
    endDate: draft.endDate,
    nightlyRateCents: centsFromEuroInput(draft.euros),
  };
}

function messageOf(failure: unknown, fallback: string): string {
  return failure instanceof ApiRequestError ? failure.message : fallback;
}

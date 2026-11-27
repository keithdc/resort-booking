/**
 * @file apps/admin/src/features/property/hooks/use-property-discounts.ts
 * @feature property
 * @dependencies staff-discounts-api, discount-draft
 */

'use client';

import type { Discount } from '@resort-booking/shared-types';
import { useCallback, useEffect, useState } from 'react';
import { ApiRequestError } from '@/shared/services/api-client';
import { createDiscount, deleteDiscount, fetchDiscounts, updateDiscount } from '../services/staff-discounts-api';
import {
  applyDraftPatch,
  draftFromDiscount,
  draftToWrite,
  EMPTY_DISCOUNT_DRAFT,
  validateDraft,
  type DiscountDraft,
} from '../utils/discount-draft';

export interface PropertyDiscountsState {
  discounts: Discount[];
  loading: boolean;
  saving: boolean;
  /** Last problem from the API or the network. The form stays open and filled. */
  error: string | null;
  notice: string | null;
  formOpen: boolean;
  /** Null while adding a new discount. */
  editingId: string | null;
  draft: DiscountDraft;
  /** True while the "applies to every house" confirmation is showing. */
  allHousesWarning: boolean;
  openCreate: () => void;
  openEdit: (discount: Discount) => void;
  closeForm: () => void;
  updateDraft: (patch: Partial<DiscountDraft>) => void;
  save: () => Promise<void>;
  confirmAllHouses: () => Promise<void>;
  cancelAllHouses: () => void;
  remove: (discountId: string) => Promise<void>;
  clearNotice: () => void;
  clearError: () => void;
}

/**
 * Loads and edits a property's discounts. A NEW discount that applies to every house goes through
 * a confirmation first; nothing is written until the person confirms.
 */
export function usePropertyDiscounts(propertyId: string): PropertyDiscountsState {
  const [discounts, setDiscounts] = useState<Discount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DiscountDraft>(EMPTY_DISCOUNT_DRAFT);
  const [allHousesWarning, setAllHousesWarning] = useState(false);

  const reload = useCallback(async (): Promise<void> => {
    try {
      setDiscounts(await fetchDiscounts(propertyId));
    } catch (failure: unknown) {
      setError(messageOf(failure, 'Could not load the discounts'));
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect((): void => {
    void reload();
  }, [reload]);

  const openCreate = useCallback((): void => {
    setError(null);
    setEditingId(null);
    setDraft(EMPTY_DISCOUNT_DRAFT);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((discount: Discount): void => {
    setError(null);
    setEditingId(discount.id);
    setDraft(draftFromDiscount(discount));
    setFormOpen(true);
  }, []);

  const closeForm = useCallback((): void => {
    setFormOpen(false);
    setAllHousesWarning(false);
    setError(null);
  }, []);

  const updateDraft = useCallback((patch: Partial<DiscountDraft>): void => {
    setDraft((current): DiscountDraft => applyDraftPatch(current, patch));
  }, []);

  const persist = useCallback(async (): Promise<void> => {
    setSaving(true);
    setError(null);
    try {
      const write = draftToWrite(draft);
      if (editingId === null) {
        await createDiscount(propertyId, write);
        setNotice('Discount added');
      } else {
        await updateDiscount(editingId, write);
        setNotice('Discount updated');
      }
      setFormOpen(false);
      setAllHousesWarning(false);
      await reload();
    } catch (failure: unknown) {
      setAllHousesWarning(false);
      setError(messageOf(failure, 'Could not save the discount'));
    } finally {
      setSaving(false);
    }
  }, [draft, editingId, propertyId, reload]);

  const save = useCallback(async (): Promise<void> => {
    if (Object.keys(validateDraft(draft)).length > 0) {
      return;
    }
    if (editingId === null && draft.scope === 'all') {
      setAllHousesWarning(true);
      return;
    }
    await persist();
  }, [draft, editingId, persist]);

  const confirmAllHouses = useCallback((): Promise<void> => persist(), [persist]);

  const cancelAllHouses = useCallback((): void => {
    setAllHousesWarning(false);
  }, []);

  const remove = useCallback(
    async (discountId: string): Promise<void> => {
      setSaving(true);
      setError(null);
      try {
        await deleteDiscount(discountId);
        setNotice('Discount removed');
        await reload();
      } catch (failure: unknown) {
        setError(messageOf(failure, 'Could not remove the discount'));
      } finally {
        setSaving(false);
      }
    },
    [reload],
  );

  const clearNotice = useCallback((): void => {
    setNotice(null);
  }, []);

  const clearError = useCallback((): void => {
    setError(null);
  }, []);

  return {
    discounts,
    loading,
    saving,
    error,
    notice,
    formOpen,
    editingId,
    draft,
    allHousesWarning,
    openCreate,
    openEdit,
    closeForm,
    updateDraft,
    save,
    confirmAllHouses,
    cancelAllHouses,
    remove,
    clearNotice,
    clearError,
  };
}

function messageOf(failure: unknown, fallback: string): string {
  return failure instanceof ApiRequestError ? failure.message : fallback;
}

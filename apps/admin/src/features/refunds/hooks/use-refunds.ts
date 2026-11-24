/**
 * @file apps/admin/src/features/refunds/hooks/use-refunds.ts
 * @feature refunds
 * @dependencies staff-refunds-api, refund-filters
 */

'use client';

import type { StaffRefund } from '@resort-booking/shared-types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiRequestError } from '@/shared/services/api-client';
import { fetchStaffRefunds, markStaffRefundPaid, retryStaffRefund } from '../services/staff-refunds-api';
import { apiStatusFor, matchesFilter, searchRefunds, type RefundFilter } from '../utils/refund-filters';

export interface RefundsState {
  /** The refunds that match the chip, property and search. */
  visible: StaffRefund[];
  /** How many the API returned for the chip and property, before the search. */
  total: number;
  loading: boolean;
  /** The list could not be loaded. */
  error: string | null;
  filter: RefundFilter;
  propertyId: string;
  query: string;
  /** The refund an action is running on, if any. */
  busyId: string | null;
  /** The last action failed (shown inside the refund's dialog). */
  actionError: string | null;
  /** The last action worked: a short message for a snackbar. */
  notice: string | null;
  setFilter: (filter: RefundFilter) => void;
  setPropertyId: (propertyId: string) => void;
  setQuery: (query: string) => void;
  clearActionError: () => void;
  clearNotice: () => void;
  reload: () => Promise<void>;
  retry: (refundId: string) => Promise<boolean>;
  markPaid: (refundId: string, note: string) => Promise<boolean>;
}

/**
 * The refunds list for one chip and property, plus the two things staff can do to a refund. After
 * an action the row is updated, and dropped from the list if it no longer belongs under the chip.
 */
export function useRefunds(initialFilter: RefundFilter = 'attention'): RefundsState {
  const [refunds, setRefunds] = useState<StaffRefund[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilterState] = useState<RefundFilter>(initialFilter);
  const [propertyId, setPropertyIdState] = useState('');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // A second click on the same action must not send a second request.
  const acting = useRef(false);

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      setRefunds(await fetchStaffRefunds(apiStatusFor(filter), propertyId));
    } catch (failure: unknown) {
      setRefunds([]);
      setError(failure instanceof ApiRequestError ? failure.message : 'Could not load the refunds');
    } finally {
      setLoading(false);
    }
  }, [filter, propertyId]);

  useEffect((): void => {
    void reload();
  }, [reload]);

  const apply = useCallback(
    (updated: StaffRefund): void => {
      setRefunds((rows): StaffRefund[] =>
        matchesFilter(updated, filter)
          ? rows.map((row): StaffRefund => (row.id === updated.id ? updated : row))
          : rows.filter((row): boolean => row.id !== updated.id),
      );
    },
    [filter],
  );

  const act = useCallback(
    async (refundId: string, work: () => Promise<StaffRefund>, success: string, failure: string): Promise<boolean> => {
      if (acting.current) {
        return false;
      }
      acting.current = true;
      setBusyId(refundId);
      setActionError(null);
      try {
        apply(await work());
        setNotice(success);
        return true;
      } catch (problem: unknown) {
        setActionError(problem instanceof ApiRequestError ? problem.message : failure);
        return false;
      } finally {
        setBusyId(null);
        acting.current = false;
      }
    },
    [apply],
  );

  const retry = useCallback(
    (refundId: string): Promise<boolean> =>
      act(refundId, () => retryStaffRefund(refundId), 'Refund sent again', 'Could not retry the refund. Please try again.'),
    [act],
  );

  const markPaid = useCallback(
    (refundId: string, note: string): Promise<boolean> =>
      act(
        refundId,
        () => markStaffRefundPaid(refundId, { note: note.trim() }),
        'Refund marked as sent',
        'Could not record the refund. Please try again.',
      ),
    [act],
  );

  const visible = useMemo((): StaffRefund[] => searchRefunds(refunds, query), [refunds, query]);

  return {
    visible,
    total: refunds.length,
    loading,
    error,
    filter,
    propertyId,
    query,
    busyId,
    actionError,
    notice,
    setFilter: setFilterState,
    setPropertyId: setPropertyIdState,
    setQuery,
    clearActionError: (): void => setActionError(null),
    clearNotice: (): void => setNotice(null),
    reload,
    retry,
    markPaid,
  };
}

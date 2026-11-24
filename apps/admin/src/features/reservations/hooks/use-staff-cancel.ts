/**
 * @file apps/admin/src/features/reservations/hooks/use-staff-cancel.ts
 * @feature reservations
 * @dependencies staff-reservations-api, cancel-refund
 */

'use client';

import type { StaffCancelPreview, StaffCancelReason, StaffCancelResult } from '@resort-booking/shared-types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiRequestError } from '@/shared/services/api-client';
import { cancelStaffReservation, fetchStaffCancelPreview } from '../services/staff-reservations-api';
import { chosenRefund, noteProblem } from '../utils/cancel-refund';

export interface UseStaffCancelOptions {
  reservationId: string;
  /** The dialog is open: load the preview and start with a clean form. */
  open: boolean;
  /** The booking was cancelled. */
  onCancelled: (result: StaffCancelResult) => void;
}

export interface StaffCancelState {
  preview: StaffCancelPreview | null;
  loading: boolean;
  loadError: string | null;
  reason: StaffCancelReason;
  goodwillEuros: string;
  note: string;
  /** The refund the chosen reason means, or null while the goodwill amount is not valid. */
  refundCents: number | null;
  goodwillError: string | null;
  noteError: string | null;
  canSubmit: boolean;
  saving: boolean;
  error: string | null;
  setReason: (reason: StaffCancelReason) => void;
  setGoodwillEuros: (value: string) => void;
  setNote: (value: string) => void;
  confirm: () => Promise<void>;
}

/**
 * Loads what cancelling would do, tracks the staff member's choices, and cancels once. The API
 * decides the real refund; this shows the choice and refuses an unfinished form.
 */
export function useStaffCancel({ reservationId, open, onCancelled }: UseStaffCancelOptions): StaffCancelState {
  const [preview, setPreview] = useState<StaffCancelPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reason, setReasonState] = useState<StaffCancelReason>('guest_request');
  const [goodwillEuros, setGoodwillEuros] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A second click while the request runs must not cancel twice.
  const busy = useRef(false);

  useEffect((): (() => void) => {
    let cancelled = false;
    if (open) {
      setReasonState('guest_request');
      setGoodwillEuros('');
      setNote('');
      setError(null);
      setLoadError(null);
      setPreview(null);
      setLoading(true);
      fetchStaffCancelPreview(reservationId)
        .then((loaded): void => {
          if (!cancelled) {
            setPreview(loaded);
          }
        })
        .catch((failure: unknown): void => {
          if (!cancelled) {
            setLoadError(failure instanceof ApiRequestError ? failure.message : 'Could not load the cancellation details');
          }
        })
        .finally((): void => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    }
    return (): void => {
      cancelled = true;
    };
  }, [open, reservationId]);

  const setReason = useCallback((next: StaffCancelReason): void => {
    setReasonState(next);
    setError(null);
  }, []);

  const chosen = preview === null ? { cents: null, error: null } : chosenRefund(reason, preview, goodwillEuros);
  const noteError = noteProblem(note);
  const canSubmit =
    preview !== null && preview.canCancel && chosen.cents !== null && chosen.error === null && noteError === null && !saving;

  const confirm = useCallback(async (): Promise<void> => {
    if (preview === null || !preview.canCancel || chosen.cents === null || noteProblem(note) !== null || busy.current) {
      return;
    }
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      const result = await cancelStaffReservation(reservationId, {
        reason,
        refundCents: reason === 'goodwill' ? chosen.cents : null,
        note: note.trim(),
      });
      onCancelled(result);
    } catch (failure: unknown) {
      setError(failure instanceof ApiRequestError ? failure.message : 'Could not cancel the booking. Please try again.');
    } finally {
      setSaving(false);
      busy.current = false;
    }
  }, [chosen.cents, note, onCancelled, preview, reason, reservationId]);

  return {
    preview,
    loading,
    loadError,
    reason,
    goodwillEuros,
    note,
    refundCents: chosen.cents,
    goodwillError: reason === 'goodwill' && goodwillEuros !== '' ? chosen.error : null,
    noteError: note === '' ? null : noteError,
    canSubmit,
    saving,
    error,
    setReason,
    setGoodwillEuros,
    setNote,
    confirm,
  };
}

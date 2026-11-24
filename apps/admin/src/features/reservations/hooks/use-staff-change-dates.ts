/**
 * @file apps/admin/src/features/reservations/hooks/use-staff-change-dates.ts
 * @feature reservations
 * @dependencies staff-reservations-api, dates, cancel-refund (note rule)
 */

'use client';

import type { RebookQuote, StaffChangeResult, StaffReservation } from '@resort-booking/shared-types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiRequestError } from '@/shared/services/api-client';
import { changeStaffReservationDates, quoteStaffChangeDates } from '../services/staff-reservations-api';
import { noteProblem } from '../utils/cancel-refund';
import { addDaysIso, clampNights, nightsBetween } from '../utils/dates';

export interface UseStaffChangeDatesOptions {
  stay: Pick<StaffReservation, 'id' | 'checkIn' | 'checkOut'>;
  /** The dialog is open: start from the booking's current dates. */
  open: boolean;
  /** The dates were changed. The reservation is the NEW booking. */
  onChanged: (result: StaffChangeResult) => void;
}

export interface StaffChangeDatesState {
  checkIn: string;
  nights: string;
  /** Derived from check-in and nights. */
  checkOut: string;
  waiveFee: boolean;
  quote: RebookQuote | null;
  quoting: boolean;
  note: string;
  noteError: string | null;
  /** The chosen dates are the booking's current dates: nothing to change. */
  unchanged: boolean;
  /** The guest owes money, so staff must confirm it was paid outside the system. */
  needsOutsidePayment: boolean;
  outsidePaid: boolean;
  canConfirm: boolean;
  saving: boolean;
  error: string | null;
  setCheckIn: (isoDate: string) => void;
  setNights: (nights: string) => void;
  setWaiveFee: (waive: boolean) => void;
  setNote: (note: string) => void;
  setOutsidePaid: (paid: boolean) => void;
  seePrice: () => Promise<void>;
  confirm: () => Promise<void>;
}

/**
 * Pick new dates, see the exact price difference, confirm. Any change to the dates or the fee
 * throws the old price away, so staff never confirm a number that no longer matches the form.
 */
export function useStaffChangeDates({ stay, open, onChanged }: UseStaffChangeDatesOptions): StaffChangeDatesState {
  const [checkIn, setCheckInState] = useState(stay.checkIn);
  const [nights, setNightsState] = useState(String(nightsBetween(stay.checkIn, stay.checkOut)));
  const [waiveFee, setWaiveFeeState] = useState(false);
  const [quote, setQuote] = useState<RebookQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [note, setNote] = useState('');
  const [outsidePaid, setOutsidePaid] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  useEffect((): void => {
    if (open) {
      setCheckInState(stay.checkIn);
      setNightsState(String(nightsBetween(stay.checkIn, stay.checkOut)));
      setWaiveFeeState(false);
      setQuote(null);
      setNote('');
      setOutsidePaid(false);
      setError(null);
    }
  }, [open, stay.checkIn, stay.checkOut]);

  const checkOut = addDaysIso(checkIn, clampNights(Number.parseInt(nights, 10)));
  const unchanged = checkIn === stay.checkIn && checkOut === stay.checkOut;

  const forgetQuote = useCallback((): void => {
    setQuote(null);
    setOutsidePaid(false);
    setError(null);
  }, []);

  const setCheckIn = useCallback((isoDate: string): void => {
    setCheckInState(isoDate);
    forgetQuote();
  }, [forgetQuote]);

  const setNights = useCallback((value: string): void => {
    setNightsState(value);
    forgetQuote();
  }, [forgetQuote]);

  const setWaiveFee = useCallback((waive: boolean): void => {
    setWaiveFeeState(waive);
    forgetQuote();
  }, [forgetQuote]);

  const body = useMemo(() => ({ newCheckIn: checkIn, newCheckOut: checkOut, waiveFee }), [checkIn, checkOut, waiveFee]);

  const seePrice = useCallback(async (): Promise<void> => {
    if (busy.current) {
      return;
    }
    busy.current = true;
    setQuoting(true);
    setError(null);
    try {
      setQuote(await quoteStaffChangeDates(stay.id, body));
    } catch (failure: unknown) {
      setQuote(null);
      setError(failure instanceof ApiRequestError ? failure.message : 'Could not work out the price. Please try again.');
    } finally {
      setQuoting(false);
      busy.current = false;
    }
  }, [body, stay.id]);

  const needsOutsidePayment = quote !== null && quote.payCents > 0;
  const noteIssue = noteProblem(note);
  const canConfirm =
    quote !== null && quote.available && noteIssue === null && (!needsOutsidePayment || outsidePaid) && !saving && !quoting;

  const confirm = useCallback(async (): Promise<void> => {
    if (quote === null || !canConfirm || busy.current) {
      return;
    }
    busy.current = true;
    setSaving(true);
    setError(null);
    try {
      const result = await changeStaffReservationDates(stay.id, {
        ...body,
        note: note.trim(),
        balanceSettledOutside: quote.payCents > 0 ? outsidePaid : false,
      });
      onChanged(result);
    } catch (failure: unknown) {
      setError(failure instanceof ApiRequestError ? failure.message : 'Could not change the dates. Please try again.');
    } finally {
      setSaving(false);
      busy.current = false;
    }
  }, [body, canConfirm, note, onChanged, outsidePaid, quote, stay.id]);

  return {
    checkIn,
    nights,
    checkOut,
    waiveFee,
    quote,
    quoting,
    note,
    noteError: note === '' ? null : noteIssue,
    unchanged,
    needsOutsidePayment,
    outsidePaid,
    canConfirm,
    saving,
    error,
    setCheckIn,
    setNights,
    setWaiveFee,
    setNote,
    setOutsidePaid,
    seePrice,
    confirm,
  };
}

/**
 * @file apps/web/src/features/bookings/hooks/use-change-dates.ts
 * @feature bookings
 * @dependencies bookings-api, payments-api
 */

'use client';

import type {
  DateRange,
  GuestBooking,
  PaymentSummary,
  RebookQuote,
  RefundSummary,
} from '@resort-booking/shared-types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiRequestError } from '@/shared/services/api-client';
import { completeMockPayment } from '@/shared/services/payments-api';
import { addDaysIsoDate, clampStayNights, nightsBetweenIso } from '@/shared/utils/today-iso';
import { fetchRebookAvailability, quoteRebook, rebookBooking } from '../services/bookings-api';
import type { BookingCredentials } from './use-manage-booking';

export type ChangeDatesPhase = 'choose' | 'review' | 'pay';

export interface UseChangeDatesOptions {
  credentials: BookingCredentials | null;
  booking: GuestBooking;
  /** The dates were changed. The booking is the NEW one (new reference). */
  onChanged: (booking: GuestBooking, refund: RefundSummary | null) => void;
}

export interface ChangeDatesState {
  phase: ChangeDatesPhase;
  checkIn: string;
  nights: string;
  /** Derived from check-in and nights. */
  checkOut: string;
  /** Dates taken for this stay, not counting this booking itself. */
  unavailable: DateRange[];
  quote: RebookQuote | null;
  payment: PaymentSummary | null;
  working: boolean;
  error: string | null;
  /** The chosen dates are the booking's current dates, so there is nothing to change. */
  unchanged: boolean;
  setCheckIn: (isoDate: string) => void;
  setNights: (nights: string) => void;
  seePrice: () => Promise<void>;
  confirm: () => Promise<void>;
  /** Back to choosing dates (from the price review). */
  back: () => void;
  pay: () => Promise<void>;
  decline: () => Promise<void>;
}

/**
 * Drives changing a booking's dates: pick dates, see the exact price difference, then change
 * (paying a balance first when one is owed). Every number and rule comes from the API.
 */
export function useChangeDates({ credentials, booking, onChanged }: UseChangeDatesOptions): ChangeDatesState {
  const initialNights = clampStayNights(nightsBetweenIso(booking.checkIn, booking.checkOut));
  const [checkIn, setCheckInState] = useState(booking.checkIn);
  const [nights, setNightsState] = useState(String(initialNights));
  const [unavailable, setUnavailable] = useState<DateRange[]>([]);
  const [quote, setQuote] = useState<RebookQuote | null>(null);
  const [payment, setPayment] = useState<PaymentSummary | null>(null);
  const [phase, setPhase] = useState<ChangeDatesPhase>('choose');
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const checkOut = addDaysIsoDate(checkIn, clampStayNights(Number.parseInt(nights, 10)));
  const unchanged = checkIn === booking.checkIn && checkOut === booking.checkOut;

  // The taken dates, with this booking's own dates counted as free.
  useEffect((): (() => void) => {
    let cancelled = false;
    if (credentials !== null) {
      fetchRebookAvailability(credentials)
        .then((result): void => {
          if (!cancelled) {
            setUnavailable(result.unavailable);
          }
        })
        .catch((): void => {
          // The picker stays usable with nothing disabled; the API still rejects taken dates.
          if (!cancelled) {
            setUnavailable([]);
          }
        });
    }
    return (): void => {
      cancelled = true;
    };
  }, [credentials]);

  const reset = useCallback((): void => {
    setQuote(null);
    setError(null);
    setPhase('choose');
  }, []);

  const setCheckIn = useCallback((isoDate: string): void => {
    setCheckInState(isoDate);
    reset();
  }, [reset]);

  const setNights = useCallback((value: string): void => {
    setNightsState(value);
    reset();
  }, [reset]);

  const run = useCallback(async (work: () => Promise<void>, fallback: string): Promise<void> => {
    if (busy.current) {
      return;
    }
    busy.current = true;
    setWorking(true);
    setError(null);
    try {
      await work();
    } catch (failure: unknown) {
      setError(failure instanceof ApiRequestError ? failure.message : fallback);
    } finally {
      setWorking(false);
      busy.current = false;
    }
  }, []);

  // What the API calls need: who the guest is and the dates they picked.
  const rebookRequest = useMemo(
    () => (credentials === null ? null : { ...credentials, newCheckIn: checkIn, newCheckOut: checkOut }),
    [credentials, checkIn, checkOut],
  );

  const seePrice = useCallback(async (): Promise<void> => {
    if (rebookRequest === null) {
      return;
    }
    await run(async (): Promise<void> => {
      setQuote(await quoteRebook(rebookRequest));
      setPhase('review');
    }, 'Could not work out the price of those dates. Please try again.');
  }, [rebookRequest, run]);

  const confirm = useCallback(async (): Promise<void> => {
    if (rebookRequest === null) {
      return;
    }
    await run(async (): Promise<void> => {
      const result = await rebookBooking(rebookRequest);
      if (result.outcome === 'payment_required' && result.payment !== null) {
        setPayment(result.payment);
        setPhase('pay');
        return;
      }
      onChanged(result.booking, result.refund);
    }, 'Could not change your dates. Please try again.');
  }, [onChanged, rebookRequest, run]);

  const settle = useCallback(
    async (outcome: 'success' | 'failure'): Promise<void> => {
      if (payment === null) {
        return;
      }
      await run(async (): Promise<void> => {
        const result = await completeMockPayment(payment.id, outcome);
        if (outcome === 'success' && result.rebookedBooking !== null) {
          onChanged(result.rebookedBooking, null);
          return;
        }
        // Declined: nothing was charged and the booking is unchanged.
        setPayment(null);
        setPhase('review');
        setError('The card was declined, so nothing was charged and your booking is unchanged.');
      }, 'The payment could not be completed. Your booking is unchanged.');
    },
    [onChanged, payment, run],
  );

  const pay = useCallback((): Promise<void> => settle('success'), [settle]);
  const decline = useCallback((): Promise<void> => settle('failure'), [settle]);

  return {
    phase,
    checkIn,
    nights,
    checkOut,
    unavailable,
    quote,
    payment,
    working,
    error,
    unchanged,
    setCheckIn,
    setNights,
    seePrice,
    confirm,
    back: reset,
    pay,
    decline,
  };
}

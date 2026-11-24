/**
 * @file apps/web/src/features/bookings/hooks/use-manage-booking.ts
 * @feature bookings
 * @dependencies bookings-api
 */

'use client';

import type { GuestBooking } from '@resort-booking/shared-types';
import { useCallback, useRef, useState } from 'react';
import { ApiRequestError } from '@/shared/services/api-client';
import { cancelBooking, lookupBooking } from '../services/bookings-api';

/** The reference and email that proved who the guest is. Held in memory only. */
export interface BookingCredentials {
  reference: string;
  email: string;
}

export interface ManageBookingState {
  booking: GuestBooking | null;
  /** Who is signed in for this booking (null before a lookup succeeds). */
  credentials: BookingCredentials | null;
  /** A lookup is in flight. */
  finding: boolean;
  /** A cancellation is in flight. */
  cancelling: boolean;
  error: string | null;
  /** True right after a cancellation succeeded (drives the confirmation message). */
  justCancelled: boolean;
  find: (reference: string, email: string) => Promise<void>;
  /** Switch to a booking that replaced this one (a date change gives a new reference), keeping the email. */
  adopt: (booking: GuestBooking) => void;
  cancel: () => Promise<void>;
  /** Back to the empty form (look up another booking). */
  reset: () => void;
}

/**
 * Looks up a booking by reference and email and cancels it. The API decides every number and rule
 * (refund percent, whether cancelling is still allowed); this only carries the answers.
 */
export function useManageBooking(): ManageBookingState {
  const [booking, setBooking] = useState<GuestBooking | null>(null);
  const [finding, setFinding] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justCancelled, setJustCancelled] = useState(false);
  // The email stays only in memory, to authorize the cancel call for the booking just found.
  const credentials = useRef<BookingCredentials | null>(null);
  const [known, setKnown] = useState<BookingCredentials | null>(null);
  // A second tap while a request is in flight must not send a second request.
  const busy = useRef(false);

  const find = useCallback(async (reference: string, email: string): Promise<void> => {
    if (busy.current) {
      return;
    }
    busy.current = true;
    setFinding(true);
    setError(null);
    setJustCancelled(false);
    try {
      const found = await lookupBooking({ reference: reference.trim(), email: email.trim() });
      credentials.current = { reference: reference.trim(), email: email.trim() };
      setKnown(credentials.current);
      setBooking(found);
    } catch (failure: unknown) {
      setBooking(null);
      setError(failure instanceof ApiRequestError ? failure.message : 'Could not look up your booking. Please try again.');
    } finally {
      setFinding(false);
      busy.current = false;
    }
  }, []);

  const cancel = useCallback(async (): Promise<void> => {
    const known = credentials.current;
    if (known === null || busy.current) {
      return;
    }
    busy.current = true;
    setCancelling(true);
    setError(null);
    try {
      const updated = await cancelBooking(known);
      setBooking(updated);
      setJustCancelled(updated.status === 'cancelled');
    } catch (failure: unknown) {
      setError(failure instanceof ApiRequestError ? failure.message : 'Could not cancel your booking. Please try again.');
    } finally {
      setCancelling(false);
      busy.current = false;
    }
  }, []);

  const adopt = useCallback((next: GuestBooking): void => {
    const current = credentials.current;
    if (current === null) {
      return;
    }
    credentials.current = { reference: next.reference, email: current.email };
    setKnown(credentials.current);
    setBooking(next);
    setError(null);
    setJustCancelled(false);
  }, []);

  const reset = useCallback((): void => {
    credentials.current = null;
    setKnown(null);
    setBooking(null);
    setError(null);
    setJustCancelled(false);
  }, []);

  return { booking, credentials: known, finding, cancelling, error, justCancelled, find, adopt, cancel, reset };
}

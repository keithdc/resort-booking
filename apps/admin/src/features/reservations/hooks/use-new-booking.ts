/**
 * @file apps/admin/src/features/reservations/hooks/use-new-booking.ts
 * @feature reservations
 * @dependencies staff-reservations-api, staff-property-api, new-booking rules
 */

'use client';

import type { HouseSummary, PropertySummary, Quote, StaffReservation } from '@resort-booking/shared-types';
import { isValidEmail, isValidPhone } from '@resort-booking/ui/contact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchStaffHouses } from '@/features/property/services/staff-property-api';
import { ApiRequestError } from '@/shared/services/api-client';
import { createStaffBooking, quoteStaffBooking } from '../services/staff-reservations-api';
import { todayLocalIso } from '../utils/dates';
import { NEW_BOOKING_MAX_NOTE, stayFromDraft, stayProblem } from '../utils/new-booking';

/** Wait this long after the last change before asking the API for a price. */
const QUOTE_DELAY_MS = 350;

export interface UseNewBookingOptions {
  open: boolean;
  properties: PropertySummary[];
  /** The property the calendar is filtered to, if any. */
  defaultPropertyId: string;
  /** The day selected on the calendar: the form starts there (or today when that is in the past). */
  defaultDate: string;
  onCreated: (booking: StaffReservation) => void;
}

export interface NewBookingState {
  propertyId: string;
  houses: HouseSummary[];
  housesLoading: boolean;
  houseId: string;
  checkIn: string;
  nights: string;
  checkOut: string;
  guests: string;
  name: string;
  email: string;
  phone: string;
  note: string;
  quote: Quote | null;
  quoting: boolean;
  quoteError: string | null;
  /** What is missing or out of range in the stay part of the form, else null. */
  problem: string | null;
  contactReady: boolean;
  canSave: boolean;
  saving: boolean;
  error: string | null;
  today: string;
  house: HouseSummary | null;
  setPropertyId: (id: string) => void;
  setHouseId: (id: string) => void;
  setCheckIn: (date: string) => void;
  setNights: (nights: string) => void;
  setGuests: (guests: string) => void;
  setName: (name: string) => void;
  setEmail: (email: string) => void;
  setPhone: (phone: string) => void;
  setNote: (note: string) => void;
  save: () => Promise<void>;
}

/**
 * The "New booking" form: pick a stay and dates, see the live price, enter the guest, save. The price is asked for
 * only when the stay part is complete, shortly after the last change, and an answer that arrives late for an older
 * form is thrown away.
 */
export function useNewBooking({ open, properties, defaultPropertyId, defaultDate, onCreated }: UseNewBookingOptions): NewBookingState {
  const today = todayLocalIso();
  const [propertyId, setPropertyIdState] = useState('');
  const [houses, setHouses] = useState<HouseSummary[]>([]);
  const [housesLoading, setHousesLoading] = useState(false);
  const [houseId, setHouseIdState] = useState('');
  const [checkIn, setCheckInState] = useState(today);
  const [nights, setNightsState] = useState('2');
  const [guests, setGuestsState] = useState('2');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingNow = useRef(false);
  const quoteRun = useRef(0);

  // The newest starting values, read only when the form opens (a parent re-render must never wipe what was typed).
  const starting = useRef({ properties, defaultPropertyId, defaultDate });
  starting.current = { properties, defaultPropertyId, defaultDate };

  // A fresh form every time it opens: the selected day (not in the past), the filtered property, nothing typed.
  useEffect((): void => {
    if (!open) {
      return;
    }
    const { properties: choices, defaultPropertyId: wanted, defaultDate: day } = starting.current;
    const first = choices.find((property): boolean => property.id === wanted) ?? (choices.length === 1 ? choices[0] : undefined);
    setPropertyIdState(first?.id ?? '');
    setHouses([]);
    setHouseIdState('');
    setCheckInState(day >= today ? day : today);
    setNightsState('2');
    setGuestsState('2');
    setName('');
    setEmail('');
    setPhone('');
    setNote('');
    setQuote(null);
    setQuoteError(null);
    setError(null);
  }, [open, today]);

  // The stays of the chosen property. One stay is chosen for the person.
  useEffect((): (() => void) => {
    let cancelled = false;
    if (!open || propertyId === '') {
      setHouses([]);
      return (): void => undefined;
    }
    setHousesLoading(true);
    fetchStaffHouses(propertyId)
      .then((rows): void => {
        if (cancelled) {
          return;
        }
        setHouses(rows);
        setHouseIdState(rows.length === 1 ? (rows[0]?.id ?? '') : '');
      })
      .catch((): void => {
        if (!cancelled) {
          setHouses([]);
          setError('Could not load the stays of this property. Please try again.');
        }
      })
      .finally((): void => {
        if (!cancelled) {
          setHousesLoading(false);
        }
      });
    return (): void => {
      cancelled = true;
    };
  }, [open, propertyId]);

  const house = useMemo((): HouseSummary | null => houses.find((row): boolean => row.id === houseId) ?? null, [houses, houseId]);
  const draft = useMemo(() => ({ houseId, checkIn, nights, guests }), [houseId, checkIn, nights, guests]);
  const stay = useMemo(() => stayFromDraft(draft, house, today), [draft, house, today]);
  const problem = stayProblem(draft, house, today);

  // The live price.
  useEffect((): (() => void) => {
    setQuote(null);
    setQuoteError(null);
    if (!open || stay === null) {
      setQuoting(false);
      return (): void => undefined;
    }
    const run = quoteRun.current + 1;
    quoteRun.current = run;
    setQuoting(true);
    const timer = setTimeout((): void => {
      quoteStaffBooking(stay)
        .then((result): void => {
          if (quoteRun.current === run) {
            setQuote(result);
          }
        })
        .catch((failure: unknown): void => {
          if (quoteRun.current === run) {
            setQuoteError(failure instanceof ApiRequestError ? failure.message : 'Could not work out the price. Please try again.');
          }
        })
        .finally((): void => {
          if (quoteRun.current === run) {
            setQuoting(false);
          }
        });
    }, QUOTE_DELAY_MS);
    return (): void => {
      clearTimeout(timer);
      // This form changed (or closed): an answer for it is no longer wanted.
      quoteRun.current += 1;
    };
  }, [open, stay]);

  const contactReady = name.trim().length > 0 && isValidEmail(email.trim()) && (phone === '' || isValidPhone(phone)) && note.length <= NEW_BOOKING_MAX_NOTE;
  const canSave = stay !== null && quote !== null && quote.available && !quoting && contactReady && !saving;

  const forget = useCallback((): void => {
    setError(null);
  }, []);

  const setPropertyId = useCallback((id: string): void => {
    setPropertyIdState(id);
    setHouseIdState('');
    forget();
  }, [forget]);
  const setHouseId = useCallback((id: string): void => {
    setHouseIdState(id);
    forget();
  }, [forget]);
  const setCheckIn = useCallback((date: string): void => {
    setCheckInState(date);
    forget();
  }, [forget]);
  const setNights = useCallback((value: string): void => {
    setNightsState(value);
    forget();
  }, [forget]);
  const setGuests = useCallback((value: string): void => {
    setGuestsState(value);
    forget();
  }, [forget]);

  const save = useCallback(async (): Promise<void> => {
    if (stay === null || !canSave || savingNow.current) {
      return;
    }
    savingNow.current = true;
    setSaving(true);
    setError(null);
    try {
      const booking = await createStaffBooking({
        ...stay,
        paymentMethod: 'pay_at_hotel',
        bookerName: name.trim(),
        bookerEmail: email.trim(),
        bookerPhone: phone,
        guestNote: note.trim(),
      });
      onCreated(booking);
    } catch (failure: unknown) {
      setError(failure instanceof ApiRequestError ? failure.message : 'Could not save the booking. Please try again.');
      if (failure instanceof ApiRequestError && failure.code === 'DATES_UNAVAILABLE') {
        // Someone took the dates since the price was shown: ask again so the form says so.
        setQuote((current): Quote | null => (current === null ? null : { ...current, available: false }));
      }
    } finally {
      setSaving(false);
      savingNow.current = false;
    }
  }, [canSave, email, name, note, onCreated, phone, stay]);

  return {
    propertyId,
    houses,
    housesLoading,
    houseId,
    checkIn,
    nights,
    checkOut: stay?.checkOut ?? '',
    guests,
    name,
    email,
    phone,
    note,
    quote,
    quoting,
    quoteError,
    problem,
    contactReady,
    canSave,
    saving,
    error,
    today,
    house,
    setPropertyId,
    setHouseId,
    setCheckIn,
    setNights,
    setGuests,
    setName,
    setEmail,
    setPhone,
    setNote,
    save,
  };
}

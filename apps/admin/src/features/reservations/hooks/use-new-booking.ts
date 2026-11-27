/**
 * @file apps/admin/src/features/reservations/hooks/use-new-booking.ts
 * @feature reservations
 * @dependencies staff-reservations-api, staff-property-api, new-booking rules
 */

'use client';

import type { BookingSource, Discount, ExtraService, HouseSummary, PropertySummary, StaffBookingQuote, StaffReservation } from '@resort-booking/shared-types';
import { isValidEmail, isValidPhone } from '@resort-booking/ui/contact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchStaffHouses } from '@/features/property/services/staff-property-api';
import { ApiRequestError } from '@/shared/services/api-client';
import { isChannelSource } from '@/shared/utils/booking-source';
import { parseEurosToCents } from '@/shared/utils/money';
import { createStaffBooking, fetchStaffBookingExtras, fetchStaffPromotions, quoteStaffBooking } from '../services/staff-reservations-api';
import { todayLocalIso } from '../utils/dates';
import { extraChoices, NEW_BOOKING_MAX_EXTRA_QUANTITY, NEW_BOOKING_MAX_NOTE, stayFromDraft, stayProblem } from '../utils/new-booking';

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
  /** Where the guest booked. A booking from Airbnb, Booking.com or another site was paid there. */
  bookingSource: BookingSource;
  /** True for a booking made on another site: the price is typed by hand and there are no extras. */
  isChannel: boolean;
  /** What the guest paid on that site, as typed (euros). */
  channelTotal: string;
  /** The typed total in cents, or null while it is empty or not a valid amount. */
  channelTotalCents: number | null;
  /** The extras the chosen property offers guests (empty while loading or when it has none). */
  extras: ExtraService[];
  /** How many of each offered extra are ticked, by extra id (absent or 0: not chosen). */
  extraQuantities: Record<string, number>;
  /** The property's promotions that can apply to the chosen stay (any state), for picking a coupon. */
  promotions: Discount[];
  /** Types the code into the promo field and applies it. */
  pickPromo: (code: string) => void;
  /** What has been typed in the promo field. */
  promoInput: string;
  /** The code the price was last worked out with ("" when none). */
  appliedPromo: string;
  quote: StaffBookingQuote | null;
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
  setPromoInput: (value: string) => void;
  applyPromo: () => void;
  removePromo: () => void;
  setPropertyId: (id: string) => void;
  setHouseId: (id: string) => void;
  setCheckIn: (date: string) => void;
  setNights: (nights: string) => void;
  setGuests: (guests: string) => void;
  setName: (name: string) => void;
  setEmail: (email: string) => void;
  setPhone: (phone: string) => void;
  setNote: (note: string) => void;
  setBookingSource: (source: BookingSource) => void;
  setChannelTotal: (value: string) => void;
  /** Ticks an extra (quantity 1 to 20) or unticks it (0). */
  setExtraQuantity: (extraId: string, quantity: number) => void;
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
  const [nights, setNightsState] = useState('1');
  const [guests, setGuestsState] = useState('2');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [note, setNote] = useState('');
  const [bookingSource, setBookingSourceState] = useState<BookingSource>('phone_email');
  const [channelTotal, setChannelTotalState] = useState('');
  const [extras, setExtras] = useState<ExtraService[]>([]);
  const [extraQuantities, setExtraQuantities] = useState<Record<string, number>>({});
  const [promotionRows, setPromotionRows] = useState<Discount[]>([]);
  const [promoInput, setPromoInputState] = useState('');
  const [appliedPromo, setAppliedPromo] = useState('');
  const [quote, setQuote] = useState<StaffBookingQuote | null>(null);
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
    setNightsState('1');
    setGuestsState('2');
    setName('');
    setEmail('');
    setPhone('');
    setNote('');
    setBookingSourceState('phone_email');
    setChannelTotalState('');
    setExtras([]);
    setExtraQuantities({});
    setPromoInputState('');
    setAppliedPromo('');
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

  // The extras the chosen property offers. A failure only hides the section: a booking does not need extras.
  useEffect((): (() => void) => {
    let cancelled = false;
    setExtras([]);
    setExtraQuantities({});
    if (!open || propertyId === '') {
      return (): void => undefined;
    }
    fetchStaffBookingExtras(propertyId)
      .then((rows): void => {
        if (!cancelled) {
          setExtras(rows);
        }
      })
      .catch((): void => {
        if (!cancelled) {
          setExtras([]);
        }
      });
    return (): void => {
      cancelled = true;
    };
  }, [open, propertyId]);

  // The property's promotions, so a coupon can be picked here. A failure only hides the list: a booking does not need one.
  useEffect((): (() => void) => {
    let cancelled = false;
    setPromotionRows([]);
    if (!open || propertyId === '') {
      return (): void => undefined;
    }
    fetchStaffPromotions(propertyId)
      .then((rows): void => {
        if (!cancelled) {
          setPromotionRows(rows);
        }
      })
      .catch((): void => {
        if (!cancelled) {
          setPromotionRows([]);
        }
      });
    return (): void => {
      cancelled = true;
    };
  }, [open, propertyId]);

  const house = useMemo((): HouseSummary | null => houses.find((row): boolean => row.id === houseId) ?? null, [houses, houseId]);
  const promotions = useMemo(
    (): Discount[] => promotionRows.filter((row): boolean => row.houseIds === null || (houseId !== '' && row.houseIds.includes(houseId))),
    [promotionRows, houseId],
  );
  const draft = useMemo(() => ({ houseId, checkIn, nights, guests }), [houseId, checkIn, nights, guests]);
  const stay = useMemo(() => stayFromDraft(draft, house, today), [draft, house, today]);
  const problem = stayProblem(draft, house, today);
  const isChannel = isChannelSource(bookingSource);
  const channelTotalCents = useMemo((): number | null => {
    const cents = parseEurosToCents(channelTotal);
    return cents !== null && cents >= 1 ? cents : null;
  }, [channelTotal]);
  // A booking made on another site has no extras (the other site sold it as it is).
  const choices = useMemo(() => (isChannel ? [] : extraChoices(extraQuantities, extras)), [isChannel, extraQuantities, extras]);

  // A promo code applies to the property's own bookings only: a booking from another site was sold as it is.
  const promoSent = isChannel ? '' : appliedPromo;

  // The live price.
  useEffect((): (() => void) => {
    // The last price stays on screen (dimmed, Total shows a loader) while the new one is worked out, so the form
    // does not jump. Saving is blocked meanwhile (`quoting`), and it is cleared when there is no stay to price.
    setQuoteError(null);
    if (!open || stay === null) {
      setQuote(null);
      setQuoting(false);
      return (): void => undefined;
    }
    const run = quoteRun.current + 1;
    quoteRun.current = run;
    setQuoting(true);
    const timer = setTimeout((): void => {
      quoteStaffBooking({ ...stay, ...(choices.length === 0 ? {} : { extras: choices }), ...(promoSent === '' ? {} : { promoCode: promoSent }) })
        .then((result): void => {
          if (quoteRun.current === run) {
            setQuote(result);
          }
        })
        .catch((failure: unknown): void => {
          if (quoteRun.current === run) {
            setQuote(null);
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
  }, [open, stay, choices, promoSent]);

  const contactReady = name.trim().length > 0 && isValidEmail(email.trim()) && (phone === '' || isValidPhone(phone)) && note.length <= NEW_BOOKING_MAX_NOTE;
  const canSave = stay !== null && quote !== null && quote.available && !quoting && contactReady && !saving && (!isChannel || channelTotalCents !== null);

  const forget = useCallback((): void => {
    setError(null);
  }, []);

  const setBookingSource = useCallback((source: BookingSource): void => {
    setBookingSourceState(source);
    forget();
  }, [forget]);
  const setChannelTotal = useCallback((value: string): void => {
    setChannelTotalState(value);
    forget();
  }, [forget]);

  const applyPromo = useCallback((): void => {
    setAppliedPromo(promoInput.trim());
    setError(null);
  }, [promoInput]);
  const pickPromo = useCallback((code: string): void => {
    setPromoInputState(code);
    setAppliedPromo(code.trim());
    setError(null);
  }, []);
  const removePromo = useCallback((): void => {
    setPromoInputState('');
    setAppliedPromo('');
    setError(null);
  }, []);
  const setPropertyId = useCallback((id: string): void => {
    setPropertyIdState(id);
    setHouseIdState('');
    // Codes belong to one property: a code typed for another one must not follow the person.
    setPromoInputState('');
    setAppliedPromo('');
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

  const setExtraQuantity = useCallback((extraId: string, quantity: number): void => {
    const whole = Number.isFinite(quantity) ? Math.min(Math.max(Math.trunc(quantity), 0), NEW_BOOKING_MAX_EXTRA_QUANTITY) : 0;
    setExtraQuantities((current): Record<string, number> => ({ ...current, [extraId]: whole }));
    setError(null);
  }, []);

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
        ...(choices.length === 0 ? {} : { extras: choices }),
        ...(promoSent === '' ? {} : { promoCode: promoSent }),
        paymentMethod: isChannel ? 'paid_by_channel' : 'pay_at_hotel',
        bookingSource,
        channelTotalCents: isChannel ? channelTotalCents : null,
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
        setQuote((current): StaffBookingQuote | null => (current === null ? null : { ...current, available: false }));
      }
    } finally {
      setSaving(false);
      savingNow.current = false;
    }
  }, [bookingSource, canSave, channelTotalCents, choices, email, isChannel, name, note, onCreated, phone, promoSent, stay]);

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
    bookingSource,
    isChannel,
    channelTotal,
    channelTotalCents,
    extras,
    extraQuantities,
    promotions,
    pickPromo,
    promoInput,
    appliedPromo,
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
    setPromoInput: setPromoInputState,
    applyPromo,
    removePromo,
    setPropertyId,
    setHouseId,
    setCheckIn,
    setNights,
    setGuests,
    setName,
    setEmail,
    setPhone,
    setNote,
    setBookingSource,
    setChannelTotal,
    setExtraQuantity,
    save,
  };
}

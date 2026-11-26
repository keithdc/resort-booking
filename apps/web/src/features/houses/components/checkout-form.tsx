/**
 * @file apps/web/src/features/houses/components/checkout-form.tsx
 * @feature houses
 * @dependencies inventory-api — no pricing math
 */

'use client';

import type {
  ExtraService,
  Hold,
  HouseDetail,
  HouseRequestOption,
  PaymentMethod,
  PromotedOffer,
  Quote,
  ReservationConfirmation,
} from '@resort-booking/shared-types';
import {
  Alert,
  Box,
  Checkbox,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormLabel,
  Link as MuiLink,
  Radio,
  RadioGroup,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { BorderBeam, ShimmerButton } from '@resort-booking/ui';
import { EmailField, isValidEmail, isValidPhone, PhoneField } from '@resort-booking/ui/contact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StayDateField } from '@/shared/components/stay-date-field';
import { useBelowDesktop } from '@/shared/hooks/use-compact-screen';
import { useHouseAvailability } from '@/shared/hooks/use-availability';
import { ApiRequestError } from '@/shared/services/api-client';
import { maxNightsFor } from '@/shared/utils/disabled-dates';
import { formatCents } from '@/shared/utils/money';
import { nightsHint } from '@/shared/utils/offers';
import { revealElement, scrollToElement } from '@/shared/utils/responsive';
import { addDaysIsoDate, clampStayNights, todayIsoDate } from '@/shared/utils/today-iso';
import { withDefaultStay, type StayQuery } from '@/shared/utils/stay-query';
import { usePublishStayQuote } from '../context/stay-quote-context';
import { createHold, fetchQuote } from '../services/inventory-api';
import { isWarningReached, remainingSecondsUntil, secondsBetween } from '../utils/hold-countdown';
import { checkoutBlockers, describeCheckoutBlockers } from '../utils/checkout-blockers';
import { BookingConfirmed } from './booking-confirmed';
import { HoldCountdown } from './hold-countdown';
import { MockPaymentPanel } from './mock-payment-panel';
import { PromoCodeField } from './promo-code-field';
import { QuoteBreakdown } from './quote-breakdown';

interface CheckoutFormProps {
  house: HouseDetail;
  initialStay: StayQuery;
  requestOptions: HouseRequestOption[];
  extras: ExtraService[];
  customRequestsEnabled: boolean;
  /** Advertised offers for this stay, for the "add N nights" hint. */
  offers?: readonly PromotedOffer[];
  /** A code from the link, put in the promo field but not applied until the guest presses Apply. */
  initialPromoCode?: string;
}

interface CheckoutFields {
  checkIn: string;
  nights: string;
  guestCount: string;
  bookerName: string;
  bookerEmail: string;
  bookerPhone: string;
  paymentMethod: PaymentMethod;
  guestNote: string;
}

/**
 * Collects contact + dates and asks Nest for quotes and holds.
 */
export function CheckoutForm({
  house,
  initialStay,
  requestOptions,
  extras,
  customRequestsEnabled,
  offers = [],
  initialPromoCode = '',
}: CheckoutFormProps): React.JSX.Element {
  const todayIso = todayIsoDate();
  const defaults = withDefaultStay(initialStay);
  const [fields, setFields] = useState<CheckoutFields>({
    checkIn: defaults.checkIn,
    nights: defaults.nights,
    guestCount: defaults.guestCount,
    bookerName: '',
    bookerEmail: '',
    bookerPhone: '',
    paymentMethod: 'card',
    guestNote: '',
  });
  const [requestIds, setRequestIds] = useState<string[]>([]);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  // What the guest typed vs the code the quote was priced with (applied only on request).
  const [promoInput, setPromoInput] = useState(initialPromoCode);
  const [appliedPromo, setAppliedPromo] = useState('');
  // Must be ticked before the dates can be held; the API refuses a hold without it.
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [hold, setHold] = useState<Hold | null>(null);
  const [confirmation, setConfirmation] = useState<ReservationConfirmation | null>(null);
  const [holdError, setHoldError] = useState<string | null>(null);
  // Set when the API says the dates went to someone else between the quote and the hold.
  const [datesTaken, setDatesTaken] = useState(false);
  const [pending, setPending] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());

  const guestCount = Number.parseInt(fields.guestCount, 10);
  const nights = clampStayNights(Number.parseInt(fields.nights, 10));
  const nightsOfferHint = nightsHint(offers, nights);
  const checkOut = addDaysIsoDate(fields.checkIn, nights);
  const availability = useHouseAvailability(house.propertySlug, house.slug, fields.checkIn);
  const maxNights = maxNightsFor(fields.checkIn, availability.maxCheckOutDate);
  const overMaxNights = maxNights !== null && nights > maxNights;

  // The clock only runs once the guest has reserved. Nothing counts down on page load, and it
  // starts from the real time the moment the hold exists, not from a stale reading.
  const holding = hold !== null;
  useEffect((): (() => void) => {
    if (!holding) {
      return (): void => undefined;
    }
    setNowMs(Date.now());
    const timer = window.setInterval((): void => {
      setNowMs(Date.now());
    }, 1000);
    return (): void => {
      window.clearInterval(timer);
    };
  }, [holding]);

  const remainingSeconds = hold !== null && hold.status === 'active' ? remainingSecondsUntil(hold.expiresAt, nowMs) : 0;
  const expired = hold !== null && (hold.status === 'expired' || remainingSeconds === 0);
  // The warning moment and the hold's length both come from the API; nothing is hardcoded here.
  const warning = hold !== null && !expired && isWarningReached(hold.warningAt, nowMs);
  const warningSeconds = hold === null ? 0 : secondsBetween(hold.warningAt, hold.expiresAt);
  // Once the dates are held the form gives way to the payment step: one way forward.
  const paying = hold !== null && !expired;

  // --- Phone behaviour: bring the next thing on screen ---
  const belowDesktop = useBelowDesktop();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);
  const confirmed = confirmation !== null;
  // The payment step and the confirmation replace a long form; without this the guest is left
  // looking at the middle of the page. The desktop panel is sticky and already in view.
  useEffect((): void => {
    if ((paying || confirmed) && belowDesktop) {
      scrollToElement(panelRef.current);
    }
  }, [paying, confirmed, belowDesktop]);

  const loadQuote = useCallback(async (): Promise<void> => {
    if (fields.checkIn === '' || checkOut === '' || !Number.isInteger(guestCount) || guestCount < 1) {
      setQuote(null);
      return;
    }
    try {
      setQuoteError(null);
      const next = await fetchQuote(house.id, fields.checkIn, checkOut, guestCount, appliedPromo);
      setQuote(next);
    } catch (error: unknown) {
      setQuote(null);
      setQuoteError(error instanceof ApiRequestError ? error.message : 'Could not load quote');
    }
  }, [appliedPromo, checkOut, fields.checkIn, guestCount, house.id]);

  useEffect((): void => {
    void loadQuote();
  }, [loadQuote]);

  // A hold error, or "dates just taken", can appear far from the Pay button on a phone: show it.
  const showsProblem = holdError !== null || datesTaken || quoteError !== null;
  useEffect((): void => {
    if (showsProblem) {
      revealElement(errorRef.current);
    }
  }, [showsProblem, holdError, datesTaken, quoteError]);

  // The page header shows the nightly rate for these dates, so it needs the same quote.
  usePublishStayQuote(quote);

  const checkoutDisabled = useMemo((): boolean => {
    return (
      pending ||
      overMaxNights ||
      !termsAccepted ||
      quote === null ||
      !quote.available ||
      fields.bookerName.trim() === '' ||
      !isValidEmail(fields.bookerEmail) ||
      !isValidPhone(fields.bookerPhone)
    );
  }, [fields.bookerEmail, fields.bookerName, fields.bookerPhone, overMaxNights, pending, quote, termsAccepted]);

  const blockers = describeCheckoutBlockers(
    checkoutBlockers({
      pending,
      datesFree: quote !== null && quote.available,
      overMaxNights,
      nameFilled: fields.bookerName.trim() !== '',
      emailValid: isValidEmail(fields.bookerEmail),
      phoneValid: isValidPhone(fields.bookerPhone),
      termsAccepted,
    }),
  );

  const onHold = async (): Promise<void> => {
    setPending(true);
    setHoldError(null);
    setDatesTaken(false);
    try {
      const next = await createHold({
        houseId: house.id,
        checkIn: fields.checkIn,
        checkOut,
        guestCount,
        paymentMethod: fields.paymentMethod,
        bookerName: fields.bookerName.trim(),
        bookerEmail: fields.bookerEmail.trim(),
        bookerPhone: fields.bookerPhone.trim(),
        guestNote: fields.guestNote.trim(),
        requestOptionIds: requestIds,
        termsAccepted,
        ...(appliedPromo === '' ? {} : { promoCode: appliedPromo }),
      });
      setHold(next);
    } catch (error: unknown) {
      if (error instanceof ApiRequestError && error.status === 409 && error.code === 'DATES_UNAVAILABLE') {
        // Someone else got there first. Re-read the calendar and the quote so the guest can choose again.
        setDatesTaken(true);
        availability.refresh();
        void loadQuote();
      } else {
        setHoldError(error instanceof ApiRequestError ? error.message : 'Could not hold these dates');
      }
    } finally {
      setPending(false);
    }
  };

  if (confirmation !== null) {
    return (
      <Box ref={panelRef} sx={{ scrollMarginTop: 80 }}>
        <BorderBeam>
          <BookingConfirmed confirmation={confirmation} houseName={house.name} />
        </BorderBeam>
      </Box>
    );
  }

  if (paying && hold !== null) {
    return (
      <Box ref={panelRef} sx={{ scrollMarginTop: 80 }}>
      <BorderBeam>
        <Box sx={{ p: 2 }}>
          <Stack spacing={2}>
            <Typography variant="h5" component="h2">
              Complete your payment
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {house.name} · {fields.checkIn} to {checkOut} · {guestCount} guest{guestCount === 1 ? '' : 's'}
            </Typography>
            <HoldCountdown
              totalSeconds={hold.holdTtlSeconds}
              remainingSeconds={remainingSeconds}
              warningSeconds={warningSeconds}
              warning={warning}
              expired={false}
              reserving={pending}
              onHoldAgain={(): void => void onHold()}
            />
            {hold.status === 'active' && hold.paymentMethod === 'card' ? (
              <MockPaymentPanel
                holdId={hold.id}
                onConfirmed={setConfirmation}
                onDeclined={(): void => setHold(null)}
              />
            ) : null}
            {hold.paymentMethod === 'bank_transfer' ? (
              <Typography variant="body2" color="text.secondary">
                Bank transfer: the operator confirms your booking once your payment arrives.
              </Typography>
            ) : null}
          </Stack>
        </Box>
      </BorderBeam>
      </Box>
    );
  }

  const payLabel =
    fields.paymentMethod === 'bank_transfer'
      ? 'Reserve and pay by bank transfer'
      : quote === null
        ? 'Pay'
        : `Pay ${formatCents(quote.totalCents, quote.currencyCode)}`;

  return (
    <Box ref={panelRef} sx={{ scrollMarginTop: 80 }}>
    <BorderBeam>
    <Box sx={{ p: 2 }}>
      <Stack spacing={2} component="form" onSubmit={(event): void => event.preventDefault()}>
        <Typography variant="h5" component="h2">
          Book this stay
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Check-in starts today. Choose how many nights — checkout is calculated for you.
        </Typography>
        <Stack spacing={1.5}>
        <StayDateField
          label="Check-in"
          value={fields.checkIn}
          unavailable={availability.unavailable}
          todayIso={todayIso}
          onOpen={availability.refresh}
          onChange={(checkIn): void => {
            setFields((current): CheckoutFields => ({ ...current, checkIn }));
          }}
        />
        <Stack direction="row" spacing={1.5} alignItems="flex-start">
        <TextField
          label="Nights"
          type="number"
          fullWidth
          value={fields.nights}
          onChange={(event): void => {
            setFields((current): CheckoutFields => ({
              ...current,
              nights: String(clampStayNights(Number.parseInt(event.target.value, 10))),
            }));
          }}
          sx={{ '& .MuiInputBase-root': { height: 56 } }}
          error={overMaxNights}
          helperText={
            overMaxNights && availability.maxCheckOutDate !== null
              ? `Another booking starts on ${availability.maxCheckOutDate}. Max ${String(maxNights)} night${maxNights === 1 ? '' : 's'}.`
              : undefined
          }
          slotProps={{
            inputLabel: { shrink: true },
            htmlInput: {
              min: 1,
              max: maxNights !== null && maxNights >= 1 ? Math.min(30, maxNights) : 30,
              inputMode: 'numeric',
            },
          }}
          required
        />
        <TextField
          label="Guests"
          type="number"
          fullWidth
          value={fields.guestCount}
          onChange={(event): void => {
            setFields((current): CheckoutFields => ({ ...current, guestCount: event.target.value }));
          }}
          sx={{ '& .MuiInputBase-root': { height: 56 } }}
          slotProps={{
            inputLabel: { shrink: true },
            htmlInput: { min: 1, max: house.capacity, inputMode: 'numeric' },
          }}
          required
        />
        </Stack>
        </Stack>
        {nightsOfferHint === null ? null : (
          <Typography variant="body2" role="status" aria-live="polite" sx={{ color: 'secondary.main', fontWeight: 600 }}>
            {nightsOfferHint}
          </Typography>
        )}
        <Typography variant="caption" color="text.secondary">
          Leave on {checkOut} · Sleeps {house.capacity}
        </Typography>
        <TextField
          label="Name"
          autoComplete="name"
          value={fields.bookerName}
          onChange={(event): void => {
            setFields((current): CheckoutFields => ({ ...current, bookerName: event.target.value }));
          }}
          required
        />
        <EmailField
          label="Email"
          value={fields.bookerEmail}
          onChange={(bookerEmail): void => {
            setFields((current): CheckoutFields => ({ ...current, bookerEmail }));
          }}
          required
        />
        <PhoneField
          label="Phone"
          value={fields.bookerPhone}
          onChange={(bookerPhone): void => {
            setFields((current): CheckoutFields => ({ ...current, bookerPhone }));
          }}
          required
        />
        {requestOptions.length > 0 ? (
          <FormControl>
            <FormLabel>Other requests</FormLabel>
            <FormGroup>
              {requestOptions.map((option): React.JSX.Element => (
                <FormControlLabel
                  key={option.id}
                  sx={{
                    alignItems: 'flex-start',
                    mx: 0,
                    ml: -1,
                    mr: 0,
                    py: 0.5,
                  }}
                  control={
                    <Checkbox
                      sx={{ pt: 0.25 }}
                      checked={requestIds.includes(option.id)}
                      onChange={(event): void => {
                        const checked = event.target.checked;
                        setRequestIds((current): string[] =>
                          checked
                            ? [...current, option.id]
                            : current.filter((id): boolean => id !== option.id),
                        );
                      }}
                    />
                  }
                  label={
                    <Box sx={{ pt: 0.75 }}>
                      <Typography>{option.name}</Typography>
                      {option.description !== '' ? (
                        <Typography variant="body2" color="text.secondary">
                          {option.description}
                        </Typography>
                      ) : null}
                    </Box>
                  }
                />
              ))}
            </FormGroup>
          </FormControl>
        ) : null}
        {customRequestsEnabled ? (
        <TextField
          label="Ask us anything for this booking"
          multiline
          minRows={3}
          helperText="We read this after you pay. We will tell you if we can provide it."
          value={fields.guestNote}
          onChange={(event): void => {
            setFields((current): CheckoutFields => ({ ...current, guestNote: event.target.value }));
          }}
        />
        ) : null}
        {extras.length > 0 ? (
          <Box>
            <Typography variant="subtitle2">Extra services</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
              Priced extras can be added after you pay. “Ask us” extras wait for staff to confirm.
            </Typography>
            {extras.map((extra): React.JSX.Element => (
              <Typography key={extra.id} variant="body2">
                {extra.name}
                {extra.kind === 'instant'
                  ? ` · ${formatCents(extra.priceCents, extra.currencyCode)}`
                  : ' · ask us if available'}
              </Typography>
            ))}
          </Box>
        ) : null}
        <FormControl>
          <FormLabel>Pay</FormLabel>
          <RadioGroup
            value={fields.paymentMethod}
            onChange={(event): void => {
              const value = event.target.value;
              if (value !== 'card' && value !== 'bank_transfer') {
                return;
              }
              setFields((current): CheckoutFields => ({
                ...current,
                paymentMethod: value,
              }));
            }}
          >
            <FormControlLabel value="card" control={<Radio />} label="Apple Pay / Google Pay / card" />
            <FormControlLabel
              value="bank_transfer"
              control={<Radio />}
              label="Bank transfer (we confirm once your payment arrives)"
            />
          </RadioGroup>
        </FormControl>
        {showsProblem ? (
          <Stack ref={errorRef} spacing={2} sx={{ scrollMarginTop: 96 }}>
            {quoteError !== null ? <Alert severity="error">{quoteError}</Alert> : null}
            {holdError !== null ? <Alert severity="error">{holdError}</Alert> : null}
            {datesTaken ? (
              <Alert severity="warning" role="alert">
                Sorry, those dates were just taken. Pick other dates.
              </Alert>
            ) : null}
          </Stack>
        ) : null}
        <PromoCodeField
          value={promoInput}
          onChange={setPromoInput}
          appliedCode={appliedPromo}
          result={quote?.promoCode ?? null}
          onApply={(): void => setAppliedPromo(promoInput.trim())}
          onRemove={(): void => {
            setPromoInput('');
            setAppliedPromo('');
          }}
        />
        {quote === null ? (
          <Typography color="text.secondary">Choose dates to see the price.</Typography>
        ) : (
          <>
            <QuoteBreakdown quote={quote} />
            <Typography color="text.secondary">
              {quote.available ? 'These dates are free.' : 'These dates are not available.'}
            </Typography>
          </>
        )}
        <FormControlLabel
          sx={{ alignItems: 'flex-start', mr: 0 }}
          control={
            <Checkbox
              sx={{ pt: { xs: 1.25, md: 1 } }}
              checked={termsAccepted}
              onChange={(event): void => setTermsAccepted(event.target.checked)}
            />
          }
          label={
            <Typography variant="body2">
              I have read the{' '}
              <MuiLink href="#cancellation-policy">cancellation terms</MuiLink> and understand that I have no 14-day
              right of withdrawal for a booking on specific dates.
            </Typography>
          }
        />
        {/* Phones: the Pay button stays pinned to the bottom of the screen while the form scrolls past. */}
        <Box
          sx={{
            position: { xs: 'sticky', md: 'static' },
            bottom: 0,
            zIndex: 2,
            // Stack resets its children's margins, so the bleed to the card edges needs !important. The desktop
            // value needs it too: an !important rule at xs would otherwise also win at md and push the button
            // 16px past the side panel's padding.
            marginLeft: { xs: '-16px !important', md: '0 !important' },
            marginRight: { xs: '-16px !important', md: '0 !important' },
            px: { xs: 2, md: 0 },
            pt: { xs: 1.5, md: 0 },
            pb: { xs: 'calc(12px + env(safe-area-inset-bottom))', md: 0 },
            bgcolor: { xs: 'background.paper', md: 'transparent' },
            borderTop: { xs: '1px solid', md: 'none' },
            borderTopColor: { xs: 'divider', md: 'divider' },
          }}
        >
          <ShimmerButton
            fullWidth
            size="large"
            sx={{ minHeight: 52 }}
            disabled={checkoutDisabled}
            onClick={(): void => void onHold()}
          >
            {pending ? 'Holding your dates…' : payLabel}
          </ShimmerButton>
        </Box>
        {blockers !== '' && checkoutDisabled ? (
          <Typography variant="body2" color="text.secondary" role="status" aria-live="polite">
            {blockers}
          </Typography>
        ) : null}
        {hold !== null ? (
          <HoldCountdown
            totalSeconds={hold.holdTtlSeconds}
            remainingSeconds={remainingSeconds}
            warningSeconds={warningSeconds}
            warning={warning}
            expired={expired}
            reserving={pending}
            onHoldAgain={(): void => void onHold()}
          />
        ) : (
          <Typography variant="body2" color="text.secondary">
            {fields.paymentMethod === 'bank_transfer'
              ? 'We hold your dates while your transfer arrives. Nothing is charged until you pay.'
              : 'We hold your dates while you pay. Nothing is charged until you pay.'}
          </Typography>
        )}
      </Stack>
    </Box>
    </BorderBeam>
    </Box>
  );
}

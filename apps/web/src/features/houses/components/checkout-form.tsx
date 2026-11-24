/**
 * @file apps/web/src/features/houses/components/checkout-form.tsx
 * @feature houses
 * @dependencies inventory-api — no pricing math
 */

'use client';

import type { ExtraService, Hold, HouseDetail, HouseRequestOption, PaymentMethod, Quote } from '@resort-booking/shared-types';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControl,
  FormControlLabel,
  FormGroup,
  FormLabel,
  Radio,
  RadioGroup,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { BorderBeam, NumberTicker, ShimmerButton } from '@resort-booking/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StayDatePicker } from '@/shared/components/stay-date-picker';
import { useHouseAvailability } from '@/shared/hooks/use-availability';
import { ApiRequestError } from '@/shared/services/api-client';
import { maxNightsFor } from '@/shared/utils/disabled-dates';
import { formatCents } from '@/shared/utils/money';
import { addDaysIsoDate, clampStayNights, todayIsoDate } from '@/shared/utils/today-iso';
import { withDefaultStay, type StayQuery } from '@/shared/utils/stay-query';
import { createHold, fetchQuote } from '../services/inventory-api';

interface CheckoutFormProps {
  house: HouseDetail;
  initialStay: StayQuery;
  requestOptions: HouseRequestOption[];
  extras: ExtraService[];
  customRequestsEnabled: boolean;
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
  const [hold, setHold] = useState<Hold | null>(null);
  const [holdError, setHoldError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [warnOpen, setWarnOpen] = useState(false);

  const guestCount = Number.parseInt(fields.guestCount, 10);
  const nights = clampStayNights(Number.parseInt(fields.nights, 10));
  const checkOut = addDaysIsoDate(fields.checkIn, nights);
  const availability = useHouseAvailability(house.propertySlug, house.slug, fields.checkIn);
  const maxNights = maxNightsFor(fields.checkIn, availability.maxCheckOutDate);
  const overMaxNights = maxNights !== null && nights > maxNights;

  useEffect((): (() => void) => {
    const timer = window.setInterval((): void => {
      setNowMs(Date.now());
    }, 1000);
    return (): void => {
      window.clearInterval(timer);
    };
  }, []);

  const remainingMs = hold !== null && hold.status === 'active' ? Date.parse(hold.expiresAt) - nowMs : 0;
  const remainingSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const expired = hold !== null && (hold.status === 'expired' || remainingSeconds === 0);

  useEffect((): void => {
    if (hold === null || hold.status !== 'active') {
      return;
    }
    if (remainingSeconds > 0 && remainingSeconds <= 300) {
      setWarnOpen(true);
    }
  }, [hold, remainingSeconds]);

  const loadQuote = useCallback(async (): Promise<void> => {
    if (fields.checkIn === '' || checkOut === '' || !Number.isInteger(guestCount) || guestCount < 1) {
      setQuote(null);
      return;
    }
    try {
      setQuoteError(null);
      const next = await fetchQuote(house.id, fields.checkIn, checkOut, guestCount);
      setQuote(next);
    } catch (error: unknown) {
      setQuote(null);
      setQuoteError(error instanceof ApiRequestError ? error.message : 'Could not load quote');
    }
  }, [checkOut, fields.checkIn, guestCount, house.id]);

  useEffect((): void => {
    void loadQuote();
  }, [loadQuote]);

  const checkoutDisabled = useMemo((): boolean => {
    return (
      pending ||
      overMaxNights ||
      quote === null ||
      !quote.available ||
      fields.bookerName.trim() === '' ||
      fields.bookerEmail.trim() === '' ||
      fields.bookerPhone.trim() === ''
    );
  }, [fields.bookerEmail, fields.bookerName, fields.bookerPhone, overMaxNights, pending, quote]);

  const onHold = async (): Promise<void> => {
    setPending(true);
    setHoldError(null);
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
      });
      setHold(next);
    } catch (error: unknown) {
      setHoldError(error instanceof ApiRequestError ? error.message : 'Could not hold these dates');
    } finally {
      setPending(false);
    }
  };

  return (
    <BorderBeam>
    <Box sx={{ p: 2 }}>
      <Stack spacing={2} component="form" onSubmit={(event): void => event.preventDefault()}>
        <Typography variant="h5" component="h2">
          Book this property
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Check-in starts today. Choose how many nights — checkout is calculated for you.
        </Typography>
        <Stack spacing={1.5}>
        <StayDatePicker
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
              ? `Another stay starts on ${availability.maxCheckOutDate}. Max ${String(maxNights)} night${maxNights === 1 ? '' : 's'}.`
              : undefined
          }
          slotProps={{
            inputLabel: { shrink: true },
            htmlInput: { min: 1, max: maxNights !== null && maxNights >= 1 ? Math.min(30, maxNights) : 30 },
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
            htmlInput: { min: 1, max: house.capacity },
          }}
          required
        />
        </Stack>
        </Stack>
        <Typography variant="caption" color="text.secondary">
          Leave on {checkOut} · Sleeps {house.capacity}
        </Typography>
        <TextField
          label="Name"
          value={fields.bookerName}
          onChange={(event): void => {
            setFields((current): CheckoutFields => ({ ...current, bookerName: event.target.value }));
          }}
          required
        />
        <TextField
          label="Email"
          type="email"
          value={fields.bookerEmail}
          onChange={(event): void => {
            setFields((current): CheckoutFields => ({ ...current, bookerEmail: event.target.value }));
          }}
          required
        />
        <TextField
          label="Phone"
          type="tel"
          value={fields.bookerPhone}
          onChange={(event): void => {
            setFields((current): CheckoutFields => ({ ...current, bookerPhone: event.target.value }));
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
          label="Ask us anything for this stay"
          multiline
          minRows={3}
          helperText="We read this after you hold the dates. We will tell you if we can provide it."
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
            <FormControlLabel value="card" control={<Radio />} label="Apple Pay / Google Pay / card (15-minute hold)" />
            <FormControlLabel
              value="bank_transfer"
              control={<Radio />}
              label="Bank transfer (48-hour hold, staff verify)"
            />
          </RadioGroup>
        </FormControl>
        {quoteError !== null ? <Alert severity="error">{quoteError}</Alert> : null}
        {holdError !== null ? <Alert severity="error">{holdError}</Alert> : null}
        {expired ? (
          <Alert severity="warning">
            Time ran out — your details are still here.{' '}
            <Button size="small" onClick={(): void => void onHold()}>
              Hold these dates again
            </Button>
          </Alert>
        ) : null}
        {quote === null ? (
          <Typography color="text.secondary">Choose dates to see the price.</Typography>
        ) : (
          <>
            <Typography>
              <NumberTicker value={quote.nights} /> night{quote.nights === 1 ? '' : 's'} ·{' '}
              {formatCents(quote.totalCents, quote.currencyCode)}
            </Typography>
            <Typography color="text.secondary">
              {quote.available ? 'These dates are free.' : 'These dates are not available.'}
            </Typography>
          </>
        )}
        {hold !== null && hold.status === 'active' && !expired ? (
          <Typography>Dates held for {formatCountdown(remainingSeconds)}.</Typography>
        ) : null}
        <ShimmerButton disabled={checkoutDisabled || (hold !== null && !expired)} onClick={(): void => void onHold()}>
          {pending ? 'Holding dates…' : 'Hold these dates'}
        </ShimmerButton>
        <Typography variant="body2" color="text.secondary">
          Stripe capture is next. This step only freezes the property on the API.
        </Typography>
      </Stack>
      <Snackbar open={warnOpen} onClose={(): void => setWarnOpen(false)}>
        <Alert severity="warning" onClose={(): void => setWarnOpen(false)}>
          Five minutes left — finish name, contact, and pay. Stay on this page.
        </Alert>
      </Snackbar>
    </Box>
    </BorderBeam>
  );
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

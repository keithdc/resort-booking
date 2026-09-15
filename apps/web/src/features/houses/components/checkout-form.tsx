/**
 * @file apps/web/src/features/houses/components/checkout-form.tsx
 * @feature houses
 * @dependencies inventory-api — no pricing math
 */

'use client';

import type { Hold, HouseDetail, PaymentMethod, Quote } from '@resort-booking/shared-types';
import {
  Alert,
  Box,
  Button,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  Snackbar,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiRequestError } from '@/shared/services/api-client';
import { formatCents } from '@/shared/utils/money';
import { todayIsoDate } from '@/shared/utils/today-iso';
import { createHold, fetchQuote } from '../services/inventory-api';

interface CheckoutFormProps {
  house: HouseDetail;
}

interface CheckoutFields {
  checkIn: string;
  checkOut: string;
  guestCount: string;
  bookerName: string;
  bookerEmail: string;
  bookerPhone: string;
  paymentMethod: PaymentMethod;
}

/**
 * Collects contact + dates and asks Nest for quotes and holds.
 */
export function CheckoutForm({ house }: CheckoutFormProps): React.JSX.Element {
  const minDate = todayIsoDate();
  const [fields, setFields] = useState<CheckoutFields>({
    checkIn: '',
    checkOut: '',
    guestCount: '2',
    bookerName: '',
    bookerEmail: '',
    bookerPhone: '',
    paymentMethod: 'card',
  });
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [hold, setHold] = useState<Hold | null>(null);
  const [holdError, setHoldError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());
  const [warnOpen, setWarnOpen] = useState(false);

  const guestCount = Number.parseInt(fields.guestCount, 10);

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
    if (fields.checkIn === '' || fields.checkOut === '' || !Number.isInteger(guestCount) || guestCount < 1) {
      setQuote(null);
      return;
    }
    try {
      setQuoteError(null);
      const next = await fetchQuote(house.id, fields.checkIn, fields.checkOut, guestCount);
      setQuote(next);
    } catch (error: unknown) {
      setQuote(null);
      setQuoteError(error instanceof ApiRequestError ? error.message : 'Could not load quote');
    }
  }, [fields.checkIn, fields.checkOut, guestCount, house.id]);

  useEffect((): void => {
    void loadQuote();
  }, [loadQuote]);

  const checkoutDisabled = useMemo((): boolean => {
    return (
      pending ||
      quote === null ||
      !quote.available ||
      fields.bookerName.trim() === '' ||
      fields.bookerEmail.trim() === '' ||
      fields.bookerPhone.trim() === ''
    );
  }, [fields.bookerEmail, fields.bookerName, fields.bookerPhone, pending, quote]);

  const onHold = async (): Promise<void> => {
    setPending(true);
    setHoldError(null);
    try {
      const next = await createHold({
        houseId: house.id,
        checkIn: fields.checkIn,
        checkOut: fields.checkOut,
        guestCount,
        paymentMethod: fields.paymentMethod,
        bookerName: fields.bookerName.trim(),
        bookerEmail: fields.bookerEmail.trim(),
        bookerPhone: fields.bookerPhone.trim(),
      });
      setHold(next);
    } catch (error: unknown) {
      setHoldError(error instanceof ApiRequestError ? error.message : 'Could not hold these dates');
    } finally {
      setPending(false);
    }
  };

  return (
    <Box
      sx={{
        display: 'grid',
        gap: 3,
        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
        alignItems: 'start',
      }}
    >
      <Stack spacing={2} component="form" onSubmit={(event): void => event.preventDefault()}>
        <Typography variant="h4" component="h2">
          Book this house
        </Typography>
        <TextField
          label="Check-in"
          type="date"
          value={fields.checkIn}
          onChange={(event): void => {
            const checkIn = event.target.value;
            setFields((current): CheckoutFields => ({
              ...current,
              checkIn,
              checkOut: current.checkOut < checkIn ? '' : current.checkOut,
            }));
          }}
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: minDate } }}
          required
        />
        <TextField
          label="Check-out"
          type="date"
          value={fields.checkOut}
          onChange={(event): void => {
            setFields((current): CheckoutFields => ({ ...current, checkOut: event.target.value }));
          }}
          slotProps={{
            inputLabel: { shrink: true },
            htmlInput: { min: fields.checkIn !== '' ? fields.checkIn : minDate },
          }}
          required
        />
        <TextField
          label="Guests"
          type="number"
          value={fields.guestCount}
          onChange={(event): void => {
            setFields((current): CheckoutFields => ({ ...current, guestCount: event.target.value }));
          }}
          slotProps={{ htmlInput: { min: 1, max: house.capacity } }}
          helperText={`Maximum ${house.capacity}`}
          required
        />
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
        <Button variant="contained" disabled={checkoutDisabled || (hold !== null && !expired)} onClick={(): void => void onHold()}>
          {pending ? 'Holding dates…' : 'Hold dates and continue to pay'}
        </Button>
        <Typography variant="body2" color="text.secondary">
          Stripe capture is next. This step only freezes the house on the API.
        </Typography>
      </Stack>
      <Box
        sx={{
          position: { md: 'sticky' },
          top: 24,
          p: 2,
          border: 1,
          borderColor: 'divider',
          borderRadius: 1,
          bgcolor: 'background.paper',
        }}
      >
        <Typography variant="h6">Stay summary</Typography>
        {quote === null ? (
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            Choose dates to see the price from the API.
          </Typography>
        ) : (
          <>
            <Typography sx={{ mt: 1 }}>
              {quote.nights} night{quote.nights === 1 ? '' : 's'} · {formatCents(quote.totalCents, quote.currencyCode)}
            </Typography>
            <Typography color="text.secondary">
              {quote.available ? 'These dates are free.' : 'These dates are not available.'}
            </Typography>
          </>
        )}
        {hold !== null && hold.status === 'active' && !expired ? (
          <Typography sx={{ mt: 2 }}>
            House held for {formatCountdown(remainingSeconds)}.
          </Typography>
        ) : null}
      </Box>
      <Snackbar open={warnOpen} onClose={(): void => setWarnOpen(false)}>
        <Alert severity="warning" onClose={(): void => setWarnOpen(false)}>
          Five minutes left — finish name, contact, and pay. Stay on this page.
        </Alert>
      </Snackbar>
    </Box>
  );
}

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * @file apps/admin/src/features/reservations/components/new-booking-dialog.tsx
 * @feature reservations
 * @dependencies use-new-booking, new-booking-quote-summary, ui contact fields
 */

'use client';

import type { PropertySummary, StaffReservation } from '@resort-booking/shared-types';
import { EmailField, PhoneField } from '@resort-booking/ui/contact';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormHelperText,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { useNewBooking } from '../hooks/use-new-booking';
import { extraPriceText, NEW_BOOKING_MAX_EXTRA_QUANTITY, NEW_BOOKING_MAX_NIGHTS, NEW_BOOKING_MAX_NOTE, NEW_BOOKING_PAYMENT_OPTIONS } from '../utils/new-booking';
import { bookingSourceLabel, PICKABLE_SOURCES } from '@/shared/utils/booking-source';
import { formatCents } from '@/shared/utils/money';
import { NewBookingPromotions } from './new-booking-promotions';
import { NewBookingQuoteSummary } from './new-booking-quote-summary';

interface NewBookingDialogProps {
  open: boolean;
  properties: PropertySummary[];
  /** The property the calendar is filtered to ('' for all). */
  defaultPropertyId: string;
  /** The day selected on the calendar. */
  defaultDate: string;
  onClose: () => void;
  onCreated: (booking: StaffReservation) => void;
}

/**
 * Book a stay for a guest who is on the phone or at the desk: pick the stay and dates, see the price, enter the
 * guest, and choose how they pay. Pay at hotel is confirmed at once with payment Pending; a card payment link is
 * shown as coming soon. Full screen on a phone (the app's dialogs already are).
 */
export function NewBookingDialog({ open, properties, defaultPropertyId, defaultDate, onClose, onCreated }: NewBookingDialogProps): React.JSX.Element {
  const state = useNewBooking({ open, properties, defaultPropertyId, defaultDate, onCreated });
  const { quote } = state;

  return (
    <Dialog open={open} onClose={state.saving ? undefined : onClose} fullWidth maxWidth="sm" aria-labelledby="new-booking-title">
      <DialogTitle id="new-booking-title">New booking</DialogTitle>
      <DialogContent>
        <Stack
          component="form"
          id="new-booking-form"
          spacing={2}
          sx={{ mt: 1 }}
          onSubmit={(event): void => {
            event.preventDefault();
            void state.save();
          }}
        >
          <Typography variant="subtitle2" component="h3">
            Where did the guest book?
          </Typography>
          <FormControl fullWidth size="small" required>
            <InputLabel id="new-booking-source">Where did the guest book?</InputLabel>
            <Select
              labelId="new-booking-source"
              label="Where did the guest book?"
              value={state.bookingSource}
              onChange={(event): void => state.setBookingSource(event.target.value as typeof state.bookingSource)}
            >
              {PICKABLE_SOURCES.map((source): React.JSX.Element => (
                <MenuItem key={source} value={source}>
                  {bookingSourceLabel(source)}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>
              {state.isChannel
                ? `The guest booked and paid on ${bookingSourceLabel(state.bookingSource)}. Here it only holds the dates and counts in your reports.`
                : 'Used in your reports to show where bookings come from.'}
            </FormHelperText>
          </FormControl>

          <Typography variant="subtitle2" component="h3" sx={{ pt: 1 }}>
            Stay and dates
          </Typography>
          <FormControl fullWidth size="small" required>
            <InputLabel id="new-booking-property">Property</InputLabel>
            <Select
              labelId="new-booking-property"
              label="Property"
              value={state.propertyId}
              onChange={(event): void => state.setPropertyId(event.target.value)}
            >
              {properties.map((property): React.JSX.Element => (
                <MenuItem key={property.id} value={property.id}>
                  {property.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl fullWidth size="small" required disabled={state.propertyId === '' || state.housesLoading}>
            <InputLabel id="new-booking-stay">Stay</InputLabel>
            <Select labelId="new-booking-stay" label="Stay" value={state.houseId} onChange={(event): void => state.setHouseId(event.target.value)}>
              {state.houses.map((house): React.JSX.Element => (
                <MenuItem key={house.id} value={house.id}>
                  {house.name} · sleeps {house.capacity}
                </MenuItem>
              ))}
            </Select>
            {state.propertyId !== '' && !state.housesLoading && state.houses.length === 0 ? <FormHelperText>This property has no stays yet.</FormHelperText> : null}
          </FormControl>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField
              label="Check-in"
              type="date"
              size="small"
              value={state.checkIn}
              onChange={(event): void => state.setCheckIn(event.target.value)}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: state.today } }}
              fullWidth
              required
            />
            <TextField
              label="Nights"
              type="number"
              size="small"
              value={state.nights}
              onChange={(event): void => state.setNights(event.target.value)}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 1, max: NEW_BOOKING_MAX_NIGHTS } }}
              fullWidth
              required
            />
            <TextField
              label="Guests"
              type="number"
              size="small"
              value={state.guests}
              onChange={(event): void => state.setGuests(event.target.value)}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: 1, max: state.house?.capacity ?? 50 } }}
              fullWidth
              required
            />
          </Stack>
          {state.checkOut !== '' ? (
            <Typography variant="body2" color="text.secondary">
              Check-out: {state.checkOut}
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary">
              {state.problem}
            </Typography>
          )}
          {state.quoting ? (
            <Stack direction="row" spacing={1} alignItems="center" aria-label="Working out the price">
              <CircularProgress size={16} />
              <Typography variant="body2" color="text.secondary">
                Working out the price…
              </Typography>
            </Stack>
          ) : null}
          {state.quoteError !== null ? <Alert severity="error">{state.quoteError}</Alert> : null}

          {!state.isChannel && state.extras.length > 0 ? (
            <Box component="fieldset" sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}>
              <Typography variant="subtitle2" component="legend" sx={{ pb: 0.5 }}>
                Extras
              </Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', pb: 0.5 }}>
                The extras this property offers guests. Priced extras are added to the total; an extra on request is only noted, nothing is charged until
                it is confirmed.
              </Typography>
              <Stack spacing={0.5} component="ul" sx={{ listStyle: 'none', m: 0, p: 0 }}>
                {state.extras.map((extra): React.JSX.Element => {
                  const quantity = state.extraQuantities[extra.id] ?? 0;
                  return (
                    <Stack key={extra.id} component="li" direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                      <FormControlLabel
                        sx={{ alignItems: 'flex-start', m: 0, flex: 1, minWidth: 0 }}
                        control={
                          <Checkbox
                            size="small"
                            checked={quantity > 0}
                            onChange={(event): void => state.setExtraQuantity(extra.id, event.target.checked ? 1 : 0)}
                          />
                        }
                        label={
                          <>
                            <Typography component="span" variant="body2" sx={{ display: 'block' }}>
                              {extra.name}
                            </Typography>
                            <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                              {extraPriceText(extra, (cents: number): string => formatCents(cents, extra.currencyCode))}
                            </Typography>
                          </>
                        }
                      />
                      {quantity > 0 ? (
                        <TextField
                          label="How many"
                          type="number"
                          size="small"
                          value={quantity}
                          onChange={(event): void => state.setExtraQuantity(extra.id, Math.max(1, Number.parseInt(event.target.value, 10) || 1))}
                          slotProps={{ htmlInput: { min: 1, max: NEW_BOOKING_MAX_EXTRA_QUANTITY, 'aria-label': `How many ${extra.name}` }, inputLabel: { shrink: true } }}
                          sx={{ width: 96, flexShrink: 0 }}
                        />
                      ) : null}
                    </Stack>
                  );
                })}
              </Stack>
            </Box>
          ) : null}

          {!state.isChannel && state.house !== null ? (
            <Stack direction="row" spacing={1} alignItems="flex-start">
              <TextField
                label="Promo code (optional)"
                value={state.promoInput}
                onChange={(event): void => state.setPromoInput(event.target.value)}
                onKeyDown={(event): void => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    if (state.promoInput.trim() !== '' && state.promoInput.trim() !== state.appliedPromo) {
                      state.applyPromo();
                    }
                  }
                }}
                error={state.appliedPromo !== '' && state.quote?.promoCode?.applied === false}
                helperText={
                  state.appliedPromo !== '' && state.quote?.promoCode !== null && state.quote?.promoCode !== undefined
                    ? state.quote.promoCode.message
                    : 'Only if the guest gave you a code. Offers that apply by themselves are already in the price.'
                }
                fullWidth
                slotProps={{ htmlInput: { maxLength: 40, autoCapitalize: 'characters', autoComplete: 'off', autoCorrect: 'off', spellCheck: false } }}
              />
              {state.appliedPromo !== '' ? (
                <Button sx={{ height: 56, flexShrink: 0 }} onClick={state.removePromo}>
                  Remove
                </Button>
              ) : null}
              <Button
                variant="outlined"
                sx={{ height: 56, flexShrink: 0 }}
                disabled={state.promoInput.trim() === '' || state.promoInput.trim() === state.appliedPromo}
                onClick={state.applyPromo}
              >
                Apply
              </Button>
            </Stack>
          ) : null}
          {!state.isChannel && state.house !== null ? (
            <NewBookingPromotions
              promotions={state.promotions}
              currencyCode={state.house.currencyCode}
              today={state.today}
              appliedCode={state.appliedPromo}
              onPick={state.pickPromo}
            />
          ) : null}

          {state.isChannel ? (
            <Stack spacing={1}>
              {quote !== null ? (
                <Typography variant="body2" color={quote.available ? 'text.secondary' : 'error'}>
                  {quote.available ? 'These dates are free.' : 'These dates are not free. Pick other dates.'}
                </Typography>
              ) : null}
              <TextField
                label={`Total the guest paid on ${bookingSourceLabel(state.bookingSource)} (€)`}
                size="small"
                value={state.channelTotal}
                onChange={(event): void => state.setChannelTotal(event.target.value)}
                error={state.channelTotal !== '' && state.channelTotalCents === null}
                helperText={
                  state.channelTotal !== '' && state.channelTotalCents === null
                    ? 'Enter an amount like 1200 or 1200,50.'
                    : 'Type what the guest paid there. The commission that site keeps is not tracked here.'
                }
                slotProps={{ htmlInput: { inputMode: 'decimal' } }}
                required
                fullWidth
              />
            </Stack>
          ) : quote !== null ? (
            <NewBookingQuoteSummary quote={quote} />
          ) : null}

          <Typography variant="subtitle2" component="h3" sx={{ pt: 1 }}>
            Guest
          </Typography>
          <TextField
            label="Guest name"
            size="small"
            value={state.name}
            onChange={(event): void => state.setName(event.target.value)}
            slotProps={{ htmlInput: { maxLength: 120, autoComplete: 'off' } }}
            fullWidth
            required
          />
          <EmailField label="Guest email" required value={state.email} onChange={state.setEmail} autoComplete="off" helperText="The guest uses it with the booking reference to find their booking." />
          <PhoneField label="Guest phone (optional)" value={state.phone} onChange={state.setPhone} />
          <TextField
            label="Note (optional)"
            size="small"
            value={state.note}
            onChange={(event): void => state.setNote(event.target.value)}
            helperText={`${String(state.note.length)}/${String(NEW_BOOKING_MAX_NOTE)}`}
            error={state.note.length > NEW_BOOKING_MAX_NOTE}
            slotProps={{ htmlInput: { maxLength: NEW_BOOKING_MAX_NOTE + 1 } }}
            multiline
            minRows={2}
            fullWidth
          />

          <Typography variant="subtitle2" component="h3" sx={{ pt: 1 }} id="new-booking-payment">
            Payment
          </Typography>
          <RadioGroup aria-labelledby="new-booking-payment" value={state.isChannel ? 'paid_by_channel' : 'pay_at_hotel'}>
            {state.isChannel ? (
              <FormControlLabel
                value="paid_by_channel"
                control={<Radio size="small" />}
                label={
                  <>
                    <Typography component="span" variant="body2" sx={{ display: 'block' }}>
                      Paid through {bookingSourceLabel(state.bookingSource)}
                    </Typography>
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      The guest already paid there, so this is saved as paid. Refunds for it are handled on that site.
                    </Typography>
                  </>
                }
                sx={{ alignItems: 'flex-start', mb: 0.5 }}
              />
            ) : null}
            {(state.isChannel ? [] : NEW_BOOKING_PAYMENT_OPTIONS).map((option): React.JSX.Element => (
              <FormControlLabel
                key={option.value}
                value={option.value}
                disabled={!option.enabled}
                control={<Radio size="small" />}
                label={
                  <>
                    <Typography component="span" variant="body2" sx={{ display: 'block' }}>
                      {option.label}
                    </Typography>
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                      {option.help}
                    </Typography>
                  </>
                }
                sx={{ alignItems: 'flex-start', mb: 0.5 }}
              />
            ))}
          </RadioGroup>
          <Typography variant="caption" color="text.secondary">
            This booking is saved with your name. The guest does not accept the cancellation terms online: the property&apos;s cancellation
            policy of today is saved with it.
          </Typography>
          {state.error !== null ? <Alert severity="error">{state.error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={state.saving}>
          Cancel
        </Button>
        <Button type="submit" form="new-booking-form" variant="contained" disabled={!state.canSave}>
          {state.saving ? 'Saving…' : state.isChannel ? `Add booking · paid on ${bookingSourceLabel(state.bookingSource)}` : 'Book it · pay at hotel'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

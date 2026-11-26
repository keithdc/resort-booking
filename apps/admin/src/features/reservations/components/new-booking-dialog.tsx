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
  Button,
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
import { NEW_BOOKING_MAX_NIGHTS, NEW_BOOKING_MAX_NOTE, NEW_BOOKING_PAYMENT_OPTIONS } from '../utils/new-booking';
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
          {quote !== null ? <NewBookingQuoteSummary quote={quote} /> : null}

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
          <RadioGroup aria-labelledby="new-booking-payment" value="pay_at_hotel">
            {NEW_BOOKING_PAYMENT_OPTIONS.map((option): React.JSX.Element => (
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
          {state.saving ? 'Saving…' : 'Book it · pay at hotel'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

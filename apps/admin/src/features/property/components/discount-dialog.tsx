/**
 * @file apps/admin/src/features/property/components/discount-dialog.tsx
 * @feature property
 * @dependencies discount-draft
 */

'use client';

import type { HouseSummary } from '@resort-booking/shared-types';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import {
  Alert,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  FormHelperText,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import type { ReactNode } from 'react';
import {
  AUTOMATIC_NOTE,
  COUPON_STACK_HELP,
  COUPON_STACK_LABEL,
  describeRunWindow,
  isCouponDraft,
  LIMIT_HELP,
  LIMIT_LABEL,
  RUN_WINDOW_HELP,
  RUN_WINDOW_TITLE,
  STAY_DATES_HELP,
  STAY_DATES_LABEL,
  validateDraft,
  WEEKDAY_NAMES,
  type DiscountDraft,
  type DraftProblems,
} from '../utils/discount-draft';

interface DiscountDialogProps {
  open: boolean;
  /** True when editing a saved discount. */
  editing: boolean;
  draft: DiscountDraft;
  houses: readonly HouseSummary[];
  currencyCode: string;
  /** Today's local date (YYYY-MM-DD), to say whether the run window has started. */
  today: string;
  error: string | null;
  saving: boolean;
  onChange: (patch: Partial<DiscountDraft>) => void;
  onSave: () => void;
  onClose: () => void;
}

interface ConditionSectionProps {
  label: string;
  checked: boolean;
  disabled: boolean;
  onToggle: (checked: boolean) => void;
  problem: string | undefined;
  children: ReactNode;
}

/**
 * One kind of condition: a checkbox, and its fields once ticked.
 */
function ConditionSection({ label, checked, disabled, onToggle, problem, children }: ConditionSectionProps): React.JSX.Element {
  return (
    <Stack spacing={1}>
      <FormControlLabel
        control={<Checkbox checked={checked} disabled={disabled} onChange={(event): void => onToggle(event.target.checked)} />}
        label={label}
      />
      {checked && !disabled ? (
        <Stack spacing={0.5} sx={{ pl: 4 }}>
          {children}
          {problem === undefined ? null : <FormHelperText error>{problem}</FormHelperText>}
        </Stack>
      ) : null}
    </Stack>
  );
}

/**
 * Add or edit a discount: an amount off, plus the conditions that must all be true. Past dates are
 * allowed because staff can correct history. The API stays the final judge of the rules.
 */
export function DiscountDialog({
  open,
  editing,
  draft,
  houses,
  currencyCode,
  today,
  error,
  saving,
  onChange,
  onSave,
  onClose,
}: DiscountDialogProps): React.JSX.Element {
  const problems: DraftProblems = validateDraft(draft);
  const valid = Object.keys(problems).length === 0;
  const conditionsOff = draft.alwaysOn;
  const codeIsPublic = draft.promoOn && !draft.alwaysOn;
  const currencyLabel = currencyCode === 'EUR' ? '€' : currencyCode;
  const runWindow = describeRunWindow(draft, today);

  const toggleHouse = (houseId: string, checked: boolean): void => {
    onChange({
      houseIds: checked ? [...draft.houseIds, houseId] : draft.houseIds.filter((id): boolean => id !== houseId),
    });
  };

  const toggleWeekday = (day: number): void => {
    onChange({
      weekdays: draft.weekdays.includes(day) ? draft.weekdays.filter((d): boolean => d !== day) : [...draft.weekdays, day],
    });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md" aria-labelledby="discount-dialog-title">
      <DialogTitle id="discount-dialog-title">{editing ? 'Edit discount' : 'Add a discount'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          {error === null ? null : <Alert severity="error">{error}</Alert>}
          <TextField
            label="Name"
            required
            placeholder="Long booking"
            helperText={problems.label ?? 'Shown to guests on their price'}
            error={problems.label !== undefined && draft.label !== ''}
            value={draft.label}
            onChange={(event): void => onChange({ label: event.target.value })}
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            <TextField
              select
              label="Type"
              value={draft.effectKind}
              onChange={(event): void => onChange({ effectKind: event.target.value === 'fixed' ? 'fixed' : 'percent' })}
              sx={{ minWidth: 200 }}
            >
              <MenuItem value="percent">Percentage off</MenuItem>
              <MenuItem value="fixed">Fixed amount off</MenuItem>
            </TextField>
            <TextField
              label={draft.effectKind === 'percent' ? 'Percentage (%)' : `Amount (${currencyLabel})`}
              required
              fullWidth
              helperText={problems.value}
              error={problems.value !== undefined && draft.value !== ''}
              value={draft.value}
              onChange={(event): void => onChange({ value: event.target.value })}
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
            />
          </Stack>

          <Stack spacing={0.5}>
            <TextField
              select
              label="Applies to"
              value={draft.scope}
              onChange={(event): void => onChange({ scope: event.target.value === 'chosen' ? 'chosen' : 'all' })}
            >
              <MenuItem value="all">All stays at this property</MenuItem>
              <MenuItem value="chosen">Only the stays I choose</MenuItem>
            </TextField>
            {draft.scope === 'chosen' ? (
              <FormGroup aria-label="Stays this discount applies to" sx={{ pl: 1 }}>
                {houses.map((house): React.JSX.Element => (
                  <FormControlLabel
                    key={house.id}
                    label={house.name}
                    control={
                      <Checkbox
                        checked={draft.houseIds.includes(house.id)}
                        onChange={(event): void => toggleHouse(house.id, event.target.checked)}
                      />
                    }
                  />
                ))}
                {problems.houses === undefined ? null : <FormHelperText error>{problems.houses}</FormHelperText>}
              </FormGroup>
            ) : null}
          </Stack>

          <Stack spacing={1} component="section" aria-labelledby="discount-run-title">
            <Typography variant="h6" component="h3" id="discount-run-title">
              {RUN_WINDOW_TITLE}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {RUN_WINDOW_HELP}
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField
                label="Starts"
                type="date"
                size="small"
                fullWidth
                value={draft.windowStart}
                onChange={(event): void => onChange({ windowStart: event.target.value })}
                slotProps={{ inputLabel: { shrink: true } }}
              />
              <TextField
                label="Ends"
                type="date"
                size="small"
                fullWidth
                value={draft.windowEnd}
                onChange={(event): void => onChange({ windowEnd: event.target.value })}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: draft.windowStart } }}
              />
            </Stack>
            {problems.window === undefined ? null : <FormHelperText error>{problems.window}</FormHelperText>}
            <div aria-live="polite">
              {runWindow.summary === null ? null : <Typography variant="body2">{runWindow.summary}</Typography>}
              {runWindow.stayNote === null ? null : (
                <Typography variant="body2" color="text.secondary">
                  {runWindow.stayNote}
                </Typography>
              )}
            </div>
            {runWindow.notice === null ? null : <Alert severity={runWindow.notice.severity}>{runWindow.notice.text}</Alert>}
          </Stack>

          <Stack spacing={1}>
            <Typography variant="h6" component="h3">
              When does it apply?
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Every condition you tick must be true for the discount to apply.
            </Typography>
            <FormControlLabel
              control={<Checkbox checked={draft.alwaysOn} onChange={(event): void => onChange({ alwaysOn: event.target.checked })} />}
              label="Always on (no other conditions)"
            />
            {problems.conditions === undefined ? null : <FormHelperText error>{problems.conditions}</FormHelperText>}

            <ConditionSection
              label="Long booking: minimum nights"
              checked={draft.minNightsOn}
              disabled={conditionsOff}
              onToggle={(minNightsOn): void => onChange({ minNightsOn })}
              problem={problems.minNights}
            >
              <TextField
                label="Minimum nights"
                size="small"
                value={draft.minNights}
                onChange={(event): void => onChange({ minNights: event.target.value })}
                slotProps={{ htmlInput: { inputMode: 'numeric' } }}
              />
            </ConditionSection>

            <ConditionSection
              label="Booked ahead (early bird / last minute)"
              checked={draft.leadOn}
              disabled={conditionsOff}
              onToggle={(leadOn): void => onChange({ leadOn })}
              problem={problems.lead}
            >
              <Stack direction="row" spacing={1.5}>
                <TextField
                  label="At least this many days ahead"
                  size="small"
                  fullWidth
                  value={draft.leadMin}
                  onChange={(event): void => onChange({ leadMin: event.target.value })}
                  slotProps={{ htmlInput: { inputMode: 'numeric' } }}
                />
                <TextField
                  label="At most this many days ahead"
                  size="small"
                  fullWidth
                  value={draft.leadMax}
                  onChange={(event): void => onChange({ leadMax: event.target.value })}
                  slotProps={{ htmlInput: { inputMode: 'numeric' } }}
                />
              </Stack>
            </ConditionSection>

            <ConditionSection
              label={STAY_DATES_LABEL}
              checked={draft.stayOn}
              disabled={conditionsOff}
              onToggle={(stayOn): void => onChange({ stayOn })}
              problem={problems.stay}
            >
              <Stack direction="row" spacing={1.5}>
                <TextField
                  label="Stay from"
                  type="date"
                  size="small"
                  fullWidth
                  value={draft.stayStart}
                  onChange={(event): void => onChange({ stayStart: event.target.value })}
                  slotProps={{ inputLabel: { shrink: true } }}
                />
                <TextField
                  label="Stay until"
                  type="date"
                  size="small"
                  fullWidth
                  value={draft.stayEnd}
                  onChange={(event): void => onChange({ stayEnd: event.target.value })}
                  slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: draft.stayStart } }}
                />
              </Stack>
              <FormHelperText>{STAY_DATES_HELP}</FormHelperText>
            </ConditionSection>

            <ConditionSection
              label="Weekdays: every night of the booking is one of these days"
              checked={draft.weekdayOn}
              disabled={conditionsOff}
              onToggle={(weekdayOn): void => onChange({ weekdayOn })}
              problem={problems.weekdays}
            >
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                {WEEKDAY_NAMES.map((name, day): React.JSX.Element => {
                  const selected = draft.weekdays.includes(day);
                  return (
                    <Chip
                      key={name}
                      label={name}
                      aria-pressed={selected}
                      color={selected ? 'primary' : 'default'}
                      variant={selected ? 'filled' : 'outlined'}
                      onClick={(): void => toggleWeekday(day)}
                    />
                  );
                })}
              </Stack>
            </ConditionSection>

            <ConditionSection
              label="Promo code: the guest types a code"
              checked={draft.promoOn}
              disabled={conditionsOff}
              onToggle={(promoOn): void => onChange({ promoOn })}
              problem={problems.promo}
            >
              <TextField
                label="Promo code"
                size="small"
                value={draft.promoCode}
                helperText="Not case-sensitive for guests"
                onChange={(event): void => onChange({ promoCode: event.target.value })}
              />
            </ConditionSection>
          </Stack>

          <Stack spacing={1}>
            <FormControlLabel
              control={<Switch checked={draft.limitOn} onChange={(event): void => onChange({ limitOn: event.target.checked })} />}
              label={LIMIT_LABEL}
            />
            <FormHelperText>{LIMIT_HELP}</FormHelperText>
            {draft.limitOn ? (
              <TextField
                label="Maximum bookings"
                size="small"
                sx={{ maxWidth: 200 }}
                helperText={problems.limit}
                error={problems.limit !== undefined && draft.maxRedemptions !== ''}
                value={draft.maxRedemptions}
                onChange={(event): void => onChange({ maxRedemptions: event.target.value })}
                slotProps={{ htmlInput: { inputMode: 'numeric' } }}
              />
            ) : null}
          </Stack>

          <Stack spacing={1}>
            {isCouponDraft(draft) ? (
              <>
                <FormControlLabel
                  control={<Switch checked={draft.combinable} onChange={(event): void => onChange({ combinable: event.target.checked })} />}
                  label={COUPON_STACK_LABEL}
                />
                <FormHelperText>{COUPON_STACK_HELP}</FormHelperText>
              </>
            ) : (
              <Stack direction="row" spacing={1} alignItems="center" sx={{ color: 'text.secondary' }}>
                <InfoOutlinedIcon fontSize="small" aria-hidden />
                <Typography variant="body2">{AUTOMATIC_NOTE}</Typography>
              </Stack>
            )}
          </Stack>

          <Stack spacing={1}>
            <FormControlLabel
              control={<Switch checked={draft.active} onChange={(event): void => onChange({ active: event.target.checked })} />}
              label="Switched on"
            />
            <FormControlLabel
              control={
                <Switch
                  checked={draft.promoted}
                  onChange={(event): void => onChange({ promoted: event.target.checked })}
                  slotProps={{ input: { 'aria-describedby': 'discount-promoted-help' } }}
                />
              }
              label="Show on the website"
            />
            <FormHelperText id="discount-promoted-help">
              {codeIsPublic
                ? 'Guests will SEE this code on the website. Leave off to keep the code private.'
                : 'Guests see this offer on stay pages before they pick dates.'}
            </FormHelperText>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={!valid || saving} onClick={onSave}>
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Add discount'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

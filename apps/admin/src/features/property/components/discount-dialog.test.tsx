// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/property/components/discount-dialog.test.tsx
 * @feature property
 */

import type { DiscountWrite, HouseSummary } from '@resort-booking/shared-types';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyDraftPatch, draftToWrite, EMPTY_DISCOUNT_DRAFT, type DiscountDraft } from '../utils/discount-draft';
import { DiscountDialog } from './discount-dialog';

function house(id: string, name: string): HouseSummary {
  return {
    id,
    organizationId: 'o',
    propertyId: 'p1',
    propertySlug: 'p',
    propertyName: 'P',
    propertyCity: '',
    propertyCountryCode: 'FR',
    propertyTimezone: 'Europe/Paris',
    propertyAddressLine: '',
    propertyPostalCode: '',
    slug: id,
    name,
    description: '',
    capacity: 4,
    published: true,
    nightlyRateCents: 10000,
    currencyCode: 'EUR',
    coverPhotoUrl: null,
    mapLatitude: 45.9,
    mapLongitude: 6.1,
  };
}

const HOUSES = [house('h1', 'Dune House'), house('h2', 'Cedar Cabin')];

interface HarnessProps {
  initial?: Partial<DiscountDraft>;
  today?: string;
  editing?: boolean;
  error?: string | null;
  onSaved: (write: DiscountWrite) => void;
}

/** Holds the draft like the real hook does; Save reports the DiscountWrite the API would receive. */
function Harness({ initial = {}, today = '2026-11-25', editing = false, error = null, onSaved }: HarnessProps): React.JSX.Element {
  const [draft, setDraft] = useState<DiscountDraft>({ ...EMPTY_DISCOUNT_DRAFT, ...initial });
  return (
    <DiscountDialog
      open
      editing={editing}
      draft={draft}
      houses={HOUSES}
      currencyCode="EUR"
      today={today}
      error={error}
      saving={false}
      onChange={(patch): void => setDraft((current) => applyDraftPatch(current, patch))}
      onSave={(): void => onSaved(draftToWrite(draft))}
      onClose={vi.fn<() => void>()}
    />
  );
}

function renderDialog(props: Partial<HarnessProps> = {}): ReturnType<typeof vi.fn<(write: DiscountWrite) => void>> {
  const onSaved = vi.fn<(write: DiscountWrite) => void>();
  render(<Harness onSaved={onSaved} {...props} />);
  return onSaved;
}

function saveButton(): HTMLElement {
  return screen.getByRole('button', { name: /^(Add discount|Save changes)$/ });
}

function type(label: RegExp | string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function tick(name: RegExp | string): Promise<void> {
  return userEvent.click(screen.getByRole('checkbox', { name }));
}

describe('DiscountDialog', () => {
  afterEach(cleanup);

  it('titles the dialog for adding and for editing', () => {
    renderDialog();
    expect(screen.getByRole('dialog', { name: 'Add a discount' })).toBeTruthy();
    cleanup();

    renderDialog({ editing: true });
    expect(screen.getByRole('dialog', { name: 'Edit discount' })).toBeTruthy();
  });

  describe('show on the website', () => {
    const promotedSwitch = (): HTMLInputElement => screen.getByRole('switch', { name: 'Show on the website' });

    it('is off by default and explains itself', () => {
      renderDialog();
      expect(promotedSwitch().checked).toBe(false);
      expect(screen.getByText('Guests see this offer on stay pages before they pick dates.')).toBeTruthy();
      expect(promotedSwitch().getAttribute('aria-describedby')).toBe('discount-promoted-help');
    });

    it('sends the choice when saved', async () => {
      const onSaved = renderDialog({ initial: { label: 'Long stay', value: '10', minNightsOn: true, minNights: '7' } });

      await userEvent.click(promotedSwitch());
      await userEvent.click(saveButton());

      expect(onSaved.mock.calls[0]?.[0].promoted).toBe(true);
    });

    it('stays available with a promo code, and warns that the code becomes public', async () => {
      const onSaved = renderDialog({
        initial: { label: 'Welcome', value: '10', promoOn: true, promoCode: 'WELCOME15' },
      });

      expect(promotedSwitch().disabled).toBe(false);
      expect(promotedSwitch().checked).toBe(false);
      expect(screen.getByText('Guests will SEE this code on the website. Leave off to keep the code private.')).toBeTruthy();

      await userEvent.click(promotedSwitch());
      await userEvent.click(saveButton());
      expect(onSaved.mock.calls[0]?.[0]).toMatchObject({ promoted: true, conditions: [{ kind: 'promo_code', code: 'WELCOME15' }] });
    });

    it('goes back to the plain helper text when the promo code is unticked', async () => {
      renderDialog({ initial: { label: 'Welcome', value: '10', promoOn: true, promoCode: 'WELCOME15' } });
      expect(screen.getByText(/Guests will SEE this code/)).toBeTruthy();

      await tick(/Promo code/);

      expect(screen.queryByText(/Guests will SEE this code/)).toBeNull();
      expect(screen.getByText('Guests see this offer on stay pages before they pick dates.')).toBeTruthy();
    });
  });

  describe('guardrails', () => {
    it('keeps Save disabled until name, amount and a condition are filled in', async () => {
      renderDialog();
      expect(saveButton().hasAttribute('disabled')).toBe(true);

      type(/^Name/, 'Long stay');
      type(/^Percentage \(%\)/, '10');
      expect(saveButton().hasAttribute('disabled')).toBe(true);

      await tick('Long booking: minimum nights');
      type('Minimum nights', '7');

      expect(saveButton().hasAttribute('disabled')).toBe(false);
    });

    it('explains a percentage outside 1 to 100 and blocks Save', async () => {
      renderDialog({ initial: { label: 'Big', minNightsOn: true, minNights: '7' } });

      type(/^Percentage \(%\)/, '150');

      expect(screen.getByText('A whole number from 1 to 100')).toBeTruthy();
      expect(saveButton().hasAttribute('disabled')).toBe(true);
    });

    it('asks for a condition, or "Always on"', () => {
      renderDialog({ initial: { label: 'Open', value: '10' } });

      expect(screen.getByText('Add at least one condition, or tick "Always on"')).toBeTruthy();
      expect(saveButton().hasAttribute('disabled')).toBe(true);
    });

    it('lets an always-on discount save with no conditions', async () => {
      renderDialog({ initial: { label: 'Always', value: '5' } });

      await tick(/Always on/);

      expect(saveButton().hasAttribute('disabled')).toBe(false);
    });

    it('blocks a stay window that ends before it starts', async () => {
      renderDialog({ initial: { label: 'July', value: '10' } });
      await tick(/Only for stays between/);

      type('Stay from', '2027-07-10');
      type('Stay until', '2027-07-01');

      expect(screen.getByText('The end date cannot be before the start date')).toBeTruthy();
      expect(saveButton().hasAttribute('disabled')).toBe(true);
    });

    it('does not block past dates', async () => {
      renderDialog({ initial: { label: 'History', value: '10' } });
      await tick(/Only for stays between/);

      type('Stay from', '2019-01-01');
      type('Stay until', '2019-01-05');

      expect(saveButton().hasAttribute('disabled')).toBe(false);
    });

    it('needs at least one house when only some houses are chosen', async () => {
      renderDialog({ initial: { label: 'Some', value: '10', minNightsOn: true, minNights: '7' } });

      await userEvent.click(screen.getByRole('combobox', { name: 'Applies to' }));
      await userEvent.click(await screen.findByRole('option', { name: 'Only the stays I choose' }));

      expect(screen.getByText('Choose at least one stay, or apply the discount to all stays')).toBeTruthy();
      expect(saveButton().hasAttribute('disabled')).toBe(true);

      await userEvent.click(screen.getByRole('checkbox', { name: 'Dune House' }));

      expect(saveButton().hasAttribute('disabled')).toBe(false);
    });

    it('needs at least one weekday and a valid promo code when those are ticked', async () => {
      renderDialog({ initial: { label: 'X', value: '10' } });

      await tick(/Weekdays/);
      expect(screen.getByText('Choose at least one weekday')).toBeTruthy();
      await userEvent.click(screen.getByRole('button', { name: 'Mon' }));
      expect(screen.queryByText('Choose at least one weekday')).toBeNull();

      await tick(/Promo code/);
      type('Promo code', 'AB');
      expect(screen.getByText('3 to 30 letters, numbers, dashes or underscores')).toBeTruthy();
      expect(saveButton().hasAttribute('disabled')).toBe(true);
    });

    it('shows the problem from the API above the form', () => {
      renderDialog({ error: 'One of the houses does not belong to this property' });

      expect(screen.getByRole('alert').textContent).toContain('does not belong to this property');
    });
  });

  describe('how long does it run?', () => {
    it('has its own section with the two dates and the plain help text', () => {
      renderDialog({ initial: { label: 'Sale', value: '10' } });

      const section = screen.getByRole('region', { name: 'How long does it run?' });
      expect(within(section).getByLabelText('Starts')).toBeTruthy();
      expect(within(section).getByLabelText('Ends')).toBeTruthy();
      expect(within(section).getByText('Guests can use it only when they book between these dates. Leave blank to run until you switch it off.')).toBeTruthy();
    });

    it('no longer offers a "Sale window" checkbox, and explains the stay-dates condition', async () => {
      renderDialog({ initial: { label: 'Sale', value: '10' } });

      expect(screen.queryByRole('checkbox', { name: /Sale window/ })).toBeNull();
      await tick(/Only for stays between/);
      expect(screen.getByText(/Use this for a season/)).toBeTruthy();
    });

    it('says in plain English who gets the discount, and for which stays', async () => {
      renderDialog({ initial: { label: 'Sale', value: '10', minNightsOn: true, minNights: '8' } });

      type('Starts', '2026-12-01');
      type('Ends', '2026-12-31');
      expect(screen.getByText('Guests who book from 1 Dec 2026 to 31 Dec 2026 get this discount.')).toBeTruthy();

      await tick(/Only for stays between/);
      type('Stay from', '2027-07-01');
      type('Stay until', '2027-08-31');
      expect(screen.getByText('Only for stays between 1 Jul 2027 and 31 Aug 2027.')).toBeTruthy();
    });

    it('tells the owner calmly when the window has not started yet', () => {
      renderDialog({ initial: { label: 'Sale', value: '10', minNightsOn: true, minNights: '8', windowStart: '2026-12-01', windowEnd: '2026-12-31' } });

      expect(screen.getByRole('alert').textContent).toBe('Starts in 6 days: until then guests do not see or get this discount.');
    });

    it('shows no heads-up for a window that is open today, and warns about one that is over', () => {
      renderDialog({ today: '2026-12-10', initial: { label: 'Sale', value: '10', minNightsOn: true, minNights: '8', windowStart: '2026-12-01', windowEnd: '2026-12-31' } });
      expect(screen.queryByRole('alert')).toBeNull();
      cleanup();

      renderDialog({ today: '2027-01-02', initial: { label: 'Sale', value: '10', minNightsOn: true, minNights: '8', windowStart: '2026-12-01', windowEnd: '2026-12-31' } });
      expect(screen.getByRole('alert').textContent).toBe('This window has already ended: guests no longer get this discount.');
    });

    it('asks for both dates when only one is filled, and blocks saving', () => {
      renderDialog({ initial: { label: 'Sale', value: '10', minNightsOn: true, minNights: '8' } });

      type('Starts', '2026-12-01');

      expect(screen.getByText('Choose both dates')).toBeTruthy();
      expect(saveButton().hasAttribute('disabled')).toBe(true);

      type('Ends', '2026-12-31');

      expect(saveButton().hasAttribute('disabled')).toBe(false);
    });

    it('saves the dates as the booking window, and nothing when they are left blank', async () => {
      const onSaved = renderDialog({ initial: { label: 'Sale', value: '15', minNightsOn: true, minNights: '8' } });

      type('Starts', '2026-12-01');
      type('Ends', '2026-12-31');
      await userEvent.click(saveButton());

      expect(onSaved.mock.calls[0]?.[0].conditions).toEqual([
        { kind: 'min_nights', nights: 8 },
        { kind: 'booking_window', startDate: '2026-12-01', endDate: '2026-12-31' },
      ]);
    });

    it('lets "always on" keep the dates: the discount then runs for every booking made in the window', async () => {
      const onSaved = renderDialog({ initial: { label: 'Sale', value: '15' } });

      await tick(/Always on/);
      type('Starts', '2026-12-01');
      type('Ends', '2026-12-31');
      await userEvent.click(saveButton());

      expect(onSaved.mock.calls[0]?.[0]).toMatchObject({
        alwaysOn: false,
        conditions: [{ kind: 'booking_window', startDate: '2026-12-01', endDate: '2026-12-31' }],
      });
    });

    it('fills the dates when editing a discount that has a booking window', () => {
      renderDialog({ editing: true, initial: { label: 'Sale', value: '15', minNightsOn: true, minNights: '8', windowStart: '2026-12-01', windowEnd: '2026-12-31' } });

      expect((screen.getByLabelText('Starts') as HTMLInputElement).value).toBe('2026-12-01');
      expect((screen.getByLabelText('Ends') as HTMLInputElement).value).toBe('2026-12-31');
    });
  });

  describe('always on', () => {
    it('disables every condition while ticked and re-enables them when cleared', async () => {
      renderDialog({ initial: { label: 'X', value: '10' } });
      const minNights = screen.getByRole('checkbox', { name: 'Long booking: minimum nights' });
      expect(minNights.hasAttribute('disabled')).toBe(false);

      await tick(/Always on/);

      for (const name of [/Long booking/, /Booked ahead/, /Only for stays between/, /Weekdays/, /Promo code/]) {
        expect(screen.getByRole('checkbox', { name }).hasAttribute('disabled')).toBe(true);
      }

      await tick(/Always on/);

      expect(minNights.hasAttribute('disabled')).toBe(false);
    });
  });

  describe('building the discount', () => {
    it('produces a percent long-stay discount for all houses', async () => {
      const onSaved = renderDialog({ initial: { label: 'Long stay', value: '10', minNightsOn: true, minNights: '7' } });

      await userEvent.click(saveButton());

      expect(onSaved).toHaveBeenCalledWith({
        label: 'Long stay',
        effect: { kind: 'percent', percent: 10 },
        conditions: [{ kind: 'min_nights', nights: 7 }],
        alwaysOn: false,
        houseIds: null,
        combinable: false,
        priority: 100,
        active: true,
        maxRedemptions: null,
        promoted: false,
        oncePerGuest: false,
      });
    });

    it('produces a fixed-euro discount', async () => {
      const onSaved = renderDialog({ initial: { label: 'Fixed', minNightsOn: true, minNights: '2' } });

      await userEvent.click(screen.getByRole('combobox', { name: 'Type' }));
      await userEvent.click(await screen.findByRole('option', { name: 'Fixed amount off' }));
      type(/^Amount/, '20,50');
      await userEvent.click(saveButton());

      expect(onSaved.mock.calls[0]?.[0].effect).toEqual({ kind: 'fixed', amountCents: 2050 });
    });

    it('produces each kind of condition', async () => {
      const onSaved = renderDialog({ initial: { label: 'Everything', value: '10' } });

      await tick('Long booking: minimum nights');
      type('Minimum nights', '7');
      await tick(/Booked ahead/);
      type('At least this many days ahead', '60');
      await tick(/Only for stays between/);
      type('Stay from', '2027-07-01');
      type('Stay until', '2027-07-31');
      type('Starts', '2027-05-01');
      type('Ends', '2027-05-31');
      await tick(/Weekdays/);
      await userEvent.click(screen.getByRole('button', { name: 'Thu' }));
      await userEvent.click(screen.getByRole('button', { name: 'Sun' }));
      await userEvent.click(saveButton());

      expect(onSaved.mock.calls[0]?.[0].conditions).toEqual([
        { kind: 'min_nights', nights: 7 },
        { kind: 'booking_lead_days', minDays: 60, maxDays: null },
        { kind: 'stay_dates', startDate: '2027-07-01', endDate: '2027-07-31' },
        { kind: 'booking_window', startDate: '2027-05-01', endDate: '2027-05-31' },
        { kind: 'weekday', days: [0, 4] },
      ]);
    });

    it('produces a coupon: the code, the dates it runs between, a use limit and once per guest', async () => {
      const onSaved = renderDialog({ initial: { label: 'Welcome code', value: '15' } });

      await tick(/Promo code/);
      type('Promo code', 'WELCOME15');
      type('Starts', '2027-05-01');
      type('Ends', '2027-05-31');
      await userEvent.click(screen.getByRole('switch', { name: 'Limit how many bookings can use it' }));
      type('Maximum bookings', '50');
      await userEvent.click(saveButton());

      expect(onSaved.mock.calls[0]?.[0]).toMatchObject({
        conditions: [
          { kind: 'booking_window', startDate: '2027-05-01', endDate: '2027-05-31' },
          { kind: 'promo_code', code: 'WELCOME15' },
        ],
        maxRedemptions: 50,
        oncePerGuest: true,
        alwaysOn: false,
      });
    });

    it('lets a weekday be switched back off', async () => {
      renderDialog({ initial: { label: 'X', value: '10', weekdayOn: true, weekdays: [1] } });
      const mon = screen.getByRole('button', { name: 'Mon' });
      expect(mon.getAttribute('aria-pressed')).toBe('true');

      await userEvent.click(mon);

      expect(mon.getAttribute('aria-pressed')).toBe('false');
    });

    it('produces chosen houses, switched-off and a use limit, with no priority field', async () => {
      const onSaved = renderDialog({ initial: { label: 'Some', value: '10', minNightsOn: true, minNights: '3' } });

      await userEvent.click(screen.getByRole('combobox', { name: 'Applies to' }));
      await userEvent.click(await screen.findByRole('option', { name: 'Only the stays I choose' }));
      await userEvent.click(screen.getByRole('checkbox', { name: 'Cedar Cabin' }));
      expect(screen.queryByLabelText('Priority')).toBeNull();
      await userEvent.click(screen.getByRole('switch', { name: 'Switched on' }));
      await userEvent.click(screen.getByRole('switch', { name: 'Limit how many bookings can use it' }));
      type('Maximum bookings', '25');
      await userEvent.click(saveButton());

      expect(onSaved.mock.calls[0]?.[0]).toMatchObject({
        houseIds: ['h2'],
        combinable: false,
        priority: 100,
        active: false,
        maxRedemptions: 25,
      });
    });

    it('explains the usage limit and shows it right after the conditions', () => {
      renderDialog({ initial: { label: 'Some', value: '10', minNightsOn: true, minNights: '3' } });

      expect(screen.getByText('When the limit is reached the discount stops being offered.')).toBeTruthy();
      expect(screen.queryByRole('textbox', { name: 'Maximum bookings' })).toBeNull();
    });

    it('tells an automatic discount it does not stack, and offers no stacking switch', () => {
      renderDialog({ initial: { label: 'Alone', value: '5', minNightsOn: true, minNights: '2' } });

      expect(screen.getByText('Automatic discounts do not stack with each other: the guest gets the best one.')).toBeTruthy();
      expect(screen.queryByRole('switch', { name: 'Can be used together with an automatic discount' })).toBeNull();
      expect(screen.queryByRole('switch', { name: 'Can combine with other discounts' })).toBeNull();
    });

    it('offers the stacking switch only for a promo code, on by default, and saves the choice', async () => {
      const onSaved = renderDialog({ initial: { label: 'Code', value: '15', minNightsOn: false, promoOn: true, promoCode: 'WELCOME15' } });
      const stack = screen.getByRole('switch', { name: 'Can be used together with an automatic discount' }) as HTMLInputElement;

      expect(stack.checked).toBe(true);
      expect(screen.getByText(/A coupon is applied after the best automatic discount, on what is left/)).toBeTruthy();
      expect(screen.queryByText('Automatic discounts do not stack with each other: the guest gets the best one.')).toBeNull();

      await userEvent.click(stack);
      await userEvent.click(saveButton());

      expect(onSaved.mock.calls[0]?.[0]).toMatchObject({ combinable: false });
    });

    it('saves a coupon that stacks', async () => {
      const onSaved = renderDialog({ initial: { label: 'Code', value: '15', minNightsOn: false, promoOn: true, promoCode: 'WELCOME15' } });

      await userEvent.click(saveButton());

      expect(onSaved.mock.calls[0]?.[0]).toMatchObject({ combinable: true });
    });

    it('produces an always-on discount with no conditions', async () => {
      const onSaved = renderDialog({ initial: { label: 'Everyone', value: '5', minNightsOn: true, minNights: '9' } });

      await tick(/Always on/);
      await userEvent.click(saveButton());

      expect(onSaved.mock.calls[0]?.[0]).toMatchObject({ alwaysOn: true, conditions: [] });
    });
  });

  describe('a promo code is its own discount', () => {
    const onceBox = (): HTMLInputElement => screen.getByRole('checkbox', { name: 'Each guest can use this code once (checked by email)' });

    it('switches the other qualifying rules off and disables them while the promo code is ticked, and says why', async () => {
      renderDialog({ initial: { label: 'Mixed', value: '10', minNightsOn: true, minNights: '7', weekdayOn: true, weekdays: [1] } });

      await tick(/Promo code/);

      for (const name of [/Long booking/, /Booked ahead/, /Only for stays between/, /Weekdays/, /Always on/]) {
        const box = screen.getByRole('checkbox', { name }) as HTMLInputElement;
        expect(box.checked).toBe(false);
        expect(box.disabled).toBe(true);
      }
      expect(screen.getByText('A coupon is its own discount: it works with the code alone.')).toBeTruthy();
    });

    it('keeps what belongs to the voucher itself available: the run dates, the use limit, the stays and stacking', async () => {
      renderDialog({ initial: { label: 'Welcome', value: '10' } });
      await tick(/Promo code/);

      expect((screen.getByLabelText('Starts') as HTMLInputElement).disabled).toBe(false);
      expect((screen.getByRole('switch', { name: 'Limit how many bookings can use it' }) as HTMLInputElement).disabled).toBe(false);
      expect((screen.getByRole('combobox', { name: 'Applies to' }) as HTMLElement).getAttribute('aria-disabled')).not.toBe('true');
      expect(screen.getByRole('switch', { name: 'Can be used together with an automatic discount' })).toBeTruthy();
    });

    it('lets the other rules be used again once the promo code is unticked', async () => {
      renderDialog({ initial: { label: 'X', value: '10', promoOn: true, promoCode: 'ABC' } });
      await tick(/Promo code/);

      const nights = screen.getByRole('checkbox', { name: /Long booking/ }) as HTMLInputElement;
      expect(nights.disabled).toBe(false);
      await userEvent.click(nights);
      expect(nights.checked).toBe(true);
    });

    it('starts a new coupon limited to once per guest, explains how it is checked, and lets the owner untick it', async () => {
      const onSaved = renderDialog({ initial: { label: 'Welcome', value: '15' } });
      await tick(/Promo code/);
      type('Promo code', 'WELCOME15');

      expect(onceBox().checked).toBe(true);
      expect(screen.getByText(/Guests do not have accounts, so this is checked by the email address typed at checkout/)).toBeTruthy();
      expect(screen.getByText(/Someone who types a different email address could use the code again/)).toBeTruthy();
      await userEvent.click(onceBox());
      await userEvent.click(saveButton());

      expect(onSaved.mock.calls[0]?.[0]).toMatchObject({ oncePerGuest: false });
    });

    it('saves once per guest as on for a new coupon without touching it', async () => {
      const onSaved = renderDialog({ initial: { label: 'Welcome', value: '15' } });
      await tick(/Promo code/);
      type('Promo code', 'WELCOME15');
      await userEvent.click(saveButton());

      expect(onSaved.mock.calls[0]?.[0]).toMatchObject({ oncePerGuest: true });
    });

    it('never saves once per guest for a discount without a code', async () => {
      const onSaved = renderDialog({ initial: { label: 'Long stay', value: '10', minNightsOn: true, minNights: '7' } });
      await userEvent.click(saveButton());

      expect(onSaved.mock.calls[0]?.[0]).toMatchObject({ oncePerGuest: false });
    });

    it('keeps an older coupon as it was saved: once per guest stays off until the owner ticks it', async () => {
      const onSaved = renderDialog({ editing: true, initial: { label: 'Welcome', value: '15', promoOn: true, promoCode: 'WELCOME15', oncePerGuest: false } });

      expect(onceBox().checked).toBe(false);
      await userEvent.click(saveButton());

      expect(onSaved.mock.calls[0]?.[0]).toMatchObject({ oncePerGuest: false });
    });

    describe('an older discount that mixes a promo code with other rules', () => {
      const mixedDraft = { label: 'Mixed', value: '10', promoOn: true, promoCode: 'ABC', minNightsOn: true, minNights: '7', oncePerGuest: false };

      it('shows a calm notice and cannot be saved until one side is chosen', () => {
        renderDialog({ editing: true, initial: mixedDraft });

        expect(screen.getByText(/This discount mixes a promo code with other rules/)).toBeTruthy();
        expect((saveButton() as HTMLButtonElement).disabled).toBe(true);
      });

      it('"Keep the code only" drops the other rules and can then be saved', async () => {
        const onSaved = renderDialog({ editing: true, initial: mixedDraft });

        await userEvent.click(screen.getByRole('button', { name: 'Keep the code only' }));

        expect(screen.queryByText(/This discount mixes a promo code with other rules/)).toBeNull();
        await userEvent.click(saveButton());
        expect(onSaved.mock.calls[0]?.[0].conditions).toEqual([{ kind: 'promo_code', code: 'ABC' }]);
      });

      it('"Keep the other rules" drops the code and can then be saved', async () => {
        const onSaved = renderDialog({ editing: true, initial: mixedDraft });

        await userEvent.click(screen.getByRole('button', { name: 'Keep the other rules' }));

        await userEvent.click(saveButton());
        expect(onSaved.mock.calls[0]?.[0]).toMatchObject({ conditions: [{ kind: 'min_nights', nights: 7 }], oncePerGuest: false });
      });
    });
  });
});

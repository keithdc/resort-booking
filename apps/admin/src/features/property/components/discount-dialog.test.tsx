// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/property/components/discount-dialog.test.tsx
 * @feature property
 */

import type { DiscountWrite, HouseSummary } from '@resort-booking/shared-types';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { draftToWrite, EMPTY_DISCOUNT_DRAFT, type DiscountDraft } from '../utils/discount-draft';
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
  };
}

const HOUSES = [house('h1', 'Dune House'), house('h2', 'Cedar Cabin')];

interface HarnessProps {
  initial?: Partial<DiscountDraft>;
  editing?: boolean;
  error?: string | null;
  onSaved: (write: DiscountWrite) => void;
}

/** Holds the draft like the real hook does; Save reports the DiscountWrite the API would receive. */
function Harness({ initial = {}, editing = false, error = null, onSaved }: HarnessProps): React.JSX.Element {
  const [draft, setDraft] = useState<DiscountDraft>({ ...EMPTY_DISCOUNT_DRAFT, ...initial });
  return (
    <DiscountDialog
      open
      editing={editing}
      draft={draft}
      houses={HOUSES}
      currencyCode="EUR"
      error={error}
      saving={false}
      onChange={(patch): void => setDraft((current) => ({ ...current, ...patch }))}
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

  describe('guardrails', () => {
    it('keeps Save disabled until name, amount and a condition are filled in', async () => {
      renderDialog();
      expect(saveButton().hasAttribute('disabled')).toBe(true);

      type(/^Name/, 'Long stay');
      type(/^Percentage \(%\)/, '10');
      expect(saveButton().hasAttribute('disabled')).toBe(true);

      await tick('Long stay: minimum nights');
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
      await tick(/Stay dates/);

      type('Stay from', '2027-07-10');
      type('Stay until', '2027-07-01');

      expect(screen.getByText('The end date cannot be before the start date')).toBeTruthy();
      expect(saveButton().hasAttribute('disabled')).toBe(true);
    });

    it('does not block past dates', async () => {
      renderDialog({ initial: { label: 'History', value: '10' } });
      await tick(/Stay dates/);

      type('Stay from', '2019-01-01');
      type('Stay until', '2019-01-05');

      expect(saveButton().hasAttribute('disabled')).toBe(false);
    });

    it('needs at least one house when only some houses are chosen', async () => {
      renderDialog({ initial: { label: 'Some', value: '10', minNightsOn: true, minNights: '7' } });

      await userEvent.click(screen.getByRole('combobox', { name: 'Applies to' }));
      await userEvent.click(await screen.findByRole('option', { name: 'Only the houses I choose' }));

      expect(screen.getByText('Choose at least one house, or apply the discount to all houses')).toBeTruthy();
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

  describe('always on', () => {
    it('disables every condition while ticked and re-enables them when cleared', async () => {
      renderDialog({ initial: { label: 'X', value: '10' } });
      const minNights = screen.getByRole('checkbox', { name: 'Long stay: minimum nights' });
      expect(minNights.hasAttribute('disabled')).toBe(false);

      await tick(/Always on/);

      for (const name of [/Long stay/, /Booked ahead/, /Stay dates/, /Sale window/, /Weekdays/, /Promo code/]) {
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

      await tick('Long stay: minimum nights');
      type('Minimum nights', '7');
      await tick(/Booked ahead/);
      type('At least this many days ahead', '60');
      await tick(/Stay dates/);
      type('Stay from', '2027-07-01');
      type('Stay until', '2027-07-31');
      await tick(/Sale window/);
      type('Sale starts', '2027-05-01');
      type('Sale ends', '2027-05-31');
      await tick(/Weekdays/);
      await userEvent.click(screen.getByRole('button', { name: 'Thu' }));
      await userEvent.click(screen.getByRole('button', { name: 'Sun' }));
      await tick(/Promo code/);
      type('Promo code', 'WELCOME15');
      await userEvent.click(saveButton());

      expect(onSaved.mock.calls[0]?.[0].conditions).toEqual([
        { kind: 'min_nights', nights: 7 },
        { kind: 'booking_lead_days', minDays: 60, maxDays: null },
        { kind: 'stay_dates', startDate: '2027-07-01', endDate: '2027-07-31' },
        { kind: 'booking_window', startDate: '2027-05-01', endDate: '2027-05-31' },
        { kind: 'weekday', days: [0, 4] },
        { kind: 'promo_code', code: 'WELCOME15' },
      ]);
    });

    it('lets a weekday be switched back off', async () => {
      renderDialog({ initial: { label: 'X', value: '10', weekdayOn: true, weekdays: [1] } });
      const mon = screen.getByRole('button', { name: 'Mon' });
      expect(mon.getAttribute('aria-pressed')).toBe('true');

      await userEvent.click(mon);

      expect(mon.getAttribute('aria-pressed')).toBe('false');
    });

    it('produces chosen houses, stacking, priority, switched-off and a use limit', async () => {
      const onSaved = renderDialog({ initial: { label: 'Some', value: '10', minNightsOn: true, minNights: '3' } });

      await userEvent.click(screen.getByRole('combobox', { name: 'Applies to' }));
      await userEvent.click(await screen.findByRole('option', { name: 'Only the houses I choose' }));
      await userEvent.click(screen.getByRole('checkbox', { name: 'Cedar Cabin' }));
      await userEvent.click(screen.getByRole('switch', { name: 'Can combine with other discounts' }));
      type('Priority', '10');
      await userEvent.click(screen.getByRole('switch', { name: 'Switched on' }));
      await tick('Limit number of uses');
      type('Maximum uses', '25');
      await userEvent.click(saveButton());

      expect(onSaved.mock.calls[0]?.[0]).toMatchObject({
        houseIds: ['h2'],
        combinable: true,
        priority: 10,
        active: false,
        maxRedemptions: 25,
      });
    });

    it('produces an always-on discount with no conditions', async () => {
      const onSaved = renderDialog({ initial: { label: 'Everyone', value: '5', minNightsOn: true, minNights: '9' } });

      await tick(/Always on/);
      await userEvent.click(saveButton());

      expect(onSaved.mock.calls[0]?.[0]).toMatchObject({ alwaysOn: true, conditions: [] });
    });
  });
});

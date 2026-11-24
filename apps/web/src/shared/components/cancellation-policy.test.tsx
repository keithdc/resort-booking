// @vitest-environment jsdom
/**
 * @file apps/web/src/shared/components/cancellation-policy.test.tsx
 * @shared CancellationPolicySection
 */

import type { CancellationPolicy } from '@resort-booking/shared-types';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { CancellationPolicySection } from './cancellation-policy';

function policy(overrides: Partial<CancellationPolicy> = {}): CancellationPolicy {
  return {
    propertyId: 'p',
    tiers: [
      { minDaysBeforeCheckIn: 7, refundPercent: 100 },
      { minDaysBeforeCheckIn: 3, refundPercent: 75 },
      { minDaysBeforeCheckIn: 0, refundPercent: 0 },
    ],
    rebookable: false,
    rebookFeeType: 'none',
    rebookFeeValue: 0,
    ...overrides,
  };
}

function section(): HTMLElement {
  return screen.getByLabelText('Cancellation and changes');
}

describe('CancellationPolicySection', () => {
  afterEach(cleanup);

  it('can be linked to from the checkout tick-box, with room above it under the sticky header', () => {
    render(<CancellationPolicySection policy={policy()} currencyCode="EUR" />);

    expect(section().id).toBe('cancellation-policy');
  });

  it('keeps the same anchor even when the policy could not be loaded', () => {
    render(<CancellationPolicySection policy={null} currencyCode="EUR" />);

    expect(section().id).toBe('cancellation-policy');
  });

  it('lists the refund ladder as a real list a guest can scan', () => {
    render(<CancellationPolicySection policy={policy()} currencyCode="EUR" />);

    const items = within(screen.getByRole('list', { name: 'Refund by cancellation date' })).getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual([
      '7 days or more before check-in: Full refund',
      '3 days or more before check-in: 75% refund',
      'Less than 3 days before check-in, or if you do not arrive: No refund',
    ]);
  });

  it('says whether dates can be changed', () => {
    render(<CancellationPolicySection policy={policy()} currencyCode="EUR" />);

    expect(section().textContent).toContain('cannot be changed');
  });

  it('shows the fee for changing dates', () => {
    render(<CancellationPolicySection policy={policy({ rebookable: true, rebookFeeType: 'fixed', rebookFeeValue: 25 })} currencyCode="EUR" />);

    expect((section().textContent ?? '').replace(/\s/g, ' ')).toContain('fee of 25,00 €');
  });

  it('always states the property-cancels refund and the missing 14-day withdrawal right', () => {
    render(<CancellationPolicySection policy={policy()} currencyCode="EUR" />);

    expect(section().textContent).toContain('If the property has to cancel, you get 100% of what you paid back.');
    expect(section().textContent).toContain('You have no 14-day right of withdrawal because this is a booking for specific dates.');
  });

  it('explains how days are counted', () => {
    render(<CancellationPolicySection policy={policy()} currencyCode="EUR" />);

    expect(section().textContent).toContain('counted before check-in at 00:00');
  });

  it('does not invent a ladder when the property has none', () => {
    render(<CancellationPolicySection policy={policy({ tiers: [] })} currencyCode="EUR" />);

    expect(screen.queryByRole('list')).toBeNull();
    expect(section().textContent).toContain('have not been published yet');
  });

  it('tells guests to ask the property when the policy could not be loaded', () => {
    render(<CancellationPolicySection policy={null} currencyCode="EUR" />);

    expect(section().textContent).toContain('could not be loaded');
    expect(section().textContent).toContain('contact the property');
  });
});

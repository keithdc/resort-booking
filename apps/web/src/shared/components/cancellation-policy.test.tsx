// @vitest-environment jsdom
/**
 * @file apps/web/src/shared/components/cancellation-policy.test.tsx
 * @shared CancellationPolicySection
 */

import type { CancellationPolicy } from '@resort-booking/shared-types';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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
  afterEach((): void => {
    cleanup();
    window.location.hash = '';
  });

  it('can be linked to from the checkout tick-box, with room above it under the sticky header', () => {
    render(<CancellationPolicySection policy={policy()} currencyCode="EUR" />);

    expect(section().id).toBe('cancellation-policy');
  });

  it('keeps the same anchor even when the policy could not be loaded', () => {
    render(<CancellationPolicySection policy={null} currencyCode="EUR" />);

    expect(section().id).toBe('cancellation-policy');
  });

  it('leads with a one-line summary', () => {
    render(<CancellationPolicySection policy={policy()} currencyCode="EUR" />);

    expect(screen.getByText('Full refund until 7 days before check-in')).toBeTruthy();
  });

  it('lists the refund steps as an ordered list with text and percent, earliest first', () => {
    render(<CancellationPolicySection policy={policy()} currencyCode="EUR" />);

    const list = screen.getByRole('list', { name: 'Refund by cancellation date' });
    expect(list.tagName).toBe('OL');
    expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '7 or more days beforeFull refund',
      '3 to 6 days before75% refund',
      'Less than 3 days, or no-showNo refund',
    ]);
  });

  it('colours the steps by refund so full, partial and none differ', () => {
    render(<CancellationPolicySection policy={policy()} currencyCode="EUR" />);

    const items = within(screen.getByRole('list', { name: 'Refund by cancellation date' })).getAllByRole('listitem');
    expect(items.map((item) => item.getAttribute('data-tone'))).toEqual(['success', 'warning', 'error']);
  });

  it('turns the steps into deadlines when the check-in is known', () => {
    render(<CancellationPolicySection policy={policy()} currencyCode="EUR" checkIn="2026-12-10" />);

    expect(screen.getByText('Full refund until 3 Dec 2026')).toBeTruthy();
    expect(screen.getByText('3 Dec 2026 to 7 Dec 2026')).toBeTruthy();
    expect(screen.getByText('Deadlines are at 00:00, property local time.')).toBeTruthy();
  });

  it('shows no deadlines without a check-in', () => {
    render(<CancellationPolicySection policy={policy()} currencyCode="EUR" />);

    expect(screen.queryByText(/Deadlines are at/)).toBeNull();
  });

  it('keeps the full terms in a collapsed fold that is still in the page', () => {
    render(<CancellationPolicySection policy={policy()} currencyCode="EUR" />);

    const toggle = screen.getByRole('button', { name: 'Full cancellation terms' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(section().textContent).toContain('If the property has to cancel, you get 100% of what you paid back.');
  });

  it('opens the fold when the guest clicks it', () => {
    render(<CancellationPolicySection policy={policy()} currencyCode="EUR" />);
    const toggle = screen.getByRole('button', { name: 'Full cancellation terms' });

    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
  });

  it('opens the fold when the page is opened on the cancellation-terms link', () => {
    window.location.hash = '#cancellation-policy';
    render(<CancellationPolicySection policy={policy()} currencyCode="EUR" />);

    expect(screen.getByRole('button', { name: 'Full cancellation terms' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('opens the fold when the checkout link is clicked on the same page', () => {
    render(<CancellationPolicySection policy={policy()} currencyCode="EUR" />);

    act(() => {
      window.location.hash = '#cancellation-policy';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(screen.getByRole('button', { name: 'Full cancellation terms' }).getAttribute('aria-expanded')).toBe('true');
  });

  it('shows the fee for changing dates', () => {
    render(<CancellationPolicySection policy={policy({ rebookable: true, rebookFeeType: 'fixed', rebookFeeValue: 25 })} currencyCode="EUR" />);

    expect((section().textContent ?? '').replace(/\s/g, ' ')).toContain('fee of 25,00 €');
  });

  it('shows the summary "No refund after booking" when nothing is refunded', () => {
    render(<CancellationPolicySection policy={policy({ tiers: [{ minDaysBeforeCheckIn: 0, refundPercent: 0 }] })} currencyCode="EUR" />);

    expect(screen.getByText('No refund after booking')).toBeTruthy();
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
    expect(screen.queryByText(/refund until/i)).toBeNull();
    expect(section().textContent).toContain('have not been published yet');
  });

  it('tells guests to ask the property when the policy could not be loaded', () => {
    render(<CancellationPolicySection policy={null} currencyCode="EUR" />);

    expect(section().textContent).toContain('could not be loaded');
    expect(section().textContent).toContain('contact the property');
  });
});

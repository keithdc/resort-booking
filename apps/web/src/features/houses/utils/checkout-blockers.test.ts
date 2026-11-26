/**
 * @file apps/web/src/features/houses/utils/checkout-blockers.test.ts
 * @feature houses
 */

import { describe, expect, it } from 'vitest';
import { checkoutBlockers, describeCheckoutBlockers, type CheckoutBlockerInput } from './checkout-blockers';

const READY: CheckoutBlockerInput = {
  pending: false,
  datesFree: true,
  overMaxNights: false,
  nameFilled: true,
  emailValid: true,
  phoneValid: true,
  termsAccepted: true,
};

describe('checkoutBlockers', () => {
  it('is empty when everything is in place', () => {
    expect(checkoutBlockers(READY)).toEqual([]);
  });

  it('lists everything missing, in the order of the form', () => {
    expect(
      checkoutBlockers({ ...READY, datesFree: false, nameFilled: false, emailValid: false, phoneValid: false, termsAccepted: false }),
    ).toEqual([
      'choose dates that are free',
      'enter your name',
      'enter a valid email',
      'enter a valid phone number',
      'accept the cancellation terms',
    ]);
  });

  it('treats too many nights like unavailable dates', () => {
    expect(checkoutBlockers({ ...READY, overMaxNights: true })).toEqual(['choose dates that are free']);
  });

  it('stays quiet while a request is in flight', () => {
    expect(checkoutBlockers({ ...READY, pending: true, nameFilled: false })).toEqual([]);
  });
});

describe('describeCheckoutBlockers', () => {
  it('is empty for nothing missing', () => {
    expect(describeCheckoutBlockers([])).toBe('');
  });

  it('reads naturally for one, two and three items', () => {
    expect(describeCheckoutBlockers(['enter your name'])).toBe('To continue: enter your name.');
    expect(describeCheckoutBlockers(['enter your name', 'enter a valid email'])).toBe(
      'To continue: enter your name and enter a valid email.',
    );
    expect(describeCheckoutBlockers(['a', 'b', 'c'])).toBe('To continue: a, b and c.');
  });
});

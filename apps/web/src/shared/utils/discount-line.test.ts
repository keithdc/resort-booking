/**
 * @file apps/web/src/shared/utils/discount-line.test.ts
 * @shared Discount line words
 */

import { describe, expect, it } from 'vitest';
import { COMBINED_DISCOUNTS_NOTE, discountLineLabel, discountsAreCombined } from './discount-line';

describe('discountLineLabel', () => {
  it('adds the percent after the name', () => {
    expect(discountLineLabel({ label: 'Long stay: 7+ nights', percent: 10 })).toBe('Long stay: 7+ nights · 10% off');
    expect(discountLineLabel({ label: 'Welcome code', percent: 15 })).toBe('Welcome code · 15% off');
  });

  it('leaves a fixed-amount discount (no percent) as its name', () => {
    expect(discountLineLabel({ label: '20 € off' })).toBe('20 € off');
  });

  it('keeps an older snapshot line (no percent field) as it was', () => {
    expect(discountLineLabel({ label: 'Long stay', percent: undefined })).toBe('Long stay');
  });

  it('does not repeat a percent the name already says', () => {
    expect(discountLineLabel({ label: 'Early bird 10%', percent: 10 })).toBe('Early bird 10%');
    expect(discountLineLabel({ label: 'Save 10 % today', percent: 10 })).toBe('Save 10 % today');
  });

  it('is not fooled by a different number that ends the same way', () => {
    expect(discountLineLabel({ label: 'Summer 110%', percent: 10 })).toBe('Summer 110% · 10% off');
    expect(discountLineLabel({ label: 'Save 2.5%', percent: 5 })).toBe('Save 2.5% · 5% off');
  });

  it('shows up to two decimals and drops trailing zeros', () => {
    expect(discountLineLabel({ label: 'Half off', percent: 7.5 })).toBe('Half off · 7.5% off');
    expect(discountLineLabel({ label: 'Odd', percent: 12.345 })).toBe('Odd · 12.35% off');
    expect(discountLineLabel({ label: 'Whole', percent: 10.0 })).toBe('Whole · 10% off');
  });

  it('ignores a percent that makes no sense', () => {
    expect(discountLineLabel({ label: 'Zero', percent: 0 })).toBe('Zero');
    expect(discountLineLabel({ label: 'Negative', percent: -5 })).toBe('Negative');
    expect(discountLineLabel({ label: 'Broken', percent: Number.NaN })).toBe('Broken');
  });
});

describe('discountsAreCombined', () => {
  it('is true only with two or more discount lines', () => {
    expect(discountsAreCombined([])).toBe(false);
    expect(discountsAreCombined([{ discountId: 'a' }])).toBe(false);
    expect(discountsAreCombined([{ discountId: 'a' }, { discountId: 'b' }])).toBe(true);
  });

  it('has a calm note', () => {
    expect(COMBINED_DISCOUNTS_NOTE).toBe('Your discounts are combined.');
  });
});

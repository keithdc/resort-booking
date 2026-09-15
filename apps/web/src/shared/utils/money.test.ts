/**
 * @file apps/web/src/shared/utils/money.test.ts
 * @shared Display formatting
 * @dependencies money
 */

import { describe, expect, it } from 'vitest';
import { formatCents } from './money';

describe('formatCents', (): void => {
  it('formats euro minor units', (): void => {
    expect(formatCents(24000, 'EUR')).toContain('240');
  });

  it('formats zero without inventing a stay price', (): void => {
    expect(formatCents(0, 'EUR')).toMatch(/0/);
  });

  it('does not throw on a bogus currency code', (): void => {
    expect(formatCents(1200, 'NOTACURRENCY')).toContain('12.00');
  });

  it('shows an em dash for non-finite amounts', (): void => {
    expect(formatCents(Number.NaN, 'EUR')).toBe('—');
    expect(formatCents(Number.POSITIVE_INFINITY, 'EUR')).toBe('—');
  });
});

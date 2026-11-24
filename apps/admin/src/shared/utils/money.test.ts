/**
 * @file apps/admin/src/shared/utils/money.test.ts
 * @shared Staff money helpers
 */

import { describe, expect, it } from 'vitest';
import { centsFromEuroInput, eurosInputFromCents, formatCents, parseEurosToCents } from './money';

describe('parseEurosToCents', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12,50', 1250],
    ['0', 0],
    ['0.05', 5],
    [' 7 ', 700],
  ])('reads %j as %i cents', (input, cents) => {
    expect(parseEurosToCents(input)).toBe(cents);
  });

  it.each(['', '  ', '-5', 'abc', '12.345', '1e3', '12.', '.5', '€12', '1 2'])('refuses %j', (input) => {
    expect(parseEurosToCents(input)).toBeNull();
  });
});

describe('existing money helpers', () => {
  it('formats cents for display', () => {
    expect(formatCents(12000, 'EUR').replace(/\s/g, ' ')).toBe('120,00 €');
  });

  it('round-trips whole euros', () => {
    expect(eurosInputFromCents(15000)).toBe('150');
    expect(centsFromEuroInput('150')).toBe(15000);
  });
});

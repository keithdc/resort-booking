/**
 * @file apps/admin/src/features/configuration/utils/form-dirty.test.ts
 * @feature configuration
 */

import { describe, expect, it } from 'vitest';
import { isFormDirty, organizationProblem } from './form-dirty';

describe('isFormDirty', () => {
  const start = { name: 'Humphreys', iban: 'FR76' };

  it('is false for the same values and true after any change', () => {
    expect(isFormDirty(start, { ...start })).toBe(false);
    expect(isFormDirty(start, { ...start, iban: 'FR77' })).toBe(true);
    expect(isFormDirty(start, { ...start, name: '' })).toBe(true);
  });

  it('is false again when the change is undone', () => {
    expect(isFormDirty(start, { name: 'Humphreys', iban: 'FR76' })).toBe(false);
  });
});

describe('organizationProblem', () => {
  it('explains the first thing that is wrong, emails before the phone', () => {
    expect(organizationProblem({ emailsValid: false, phoneValid: false })).toContain('email');
    expect(organizationProblem({ emailsValid: true, phoneValid: false })).toContain('phone');
    expect(organizationProblem({ emailsValid: true, phoneValid: true })).toBeNull();
  });
});

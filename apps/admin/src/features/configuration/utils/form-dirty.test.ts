/**
 * @file apps/admin/src/features/configuration/utils/form-dirty.test.ts
 * @feature configuration
 */

import { describe, expect, it } from 'vitest';
import { isFormDirty, organizationProblem, passwordProblem } from './form-dirty';

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

describe('passwordProblem', () => {
  it('says nothing while empty and accepts a strong password', () => {
    expect(passwordProblem('')).toBeNull();
    expect(passwordProblem('Sunny2027')).toBeNull();
  });

  it('asks for 8 characters with a letter and a number', () => {
    expect(passwordProblem('short1')).not.toBeNull();
    expect(passwordProblem('longbutnonumber')).not.toBeNull();
    expect(passwordProblem('12345678')).not.toBeNull();
  });
});

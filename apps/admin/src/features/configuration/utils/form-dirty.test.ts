/**
 * @file apps/admin/src/features/configuration/utils/form-dirty.test.ts
 * @feature configuration
 */

import { describe, expect, it } from 'vitest';
import { changesSensitiveFields, isFormDirty, organizationProblem } from './form-dirty';

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

describe('changesSensitiveFields', () => {
  const base = { iban: 'FR76 0000', bic: 'ABCDFR22', bankAccountName: 'Humphreys SARL', contactEmail: 'ops@example.com', bookingEmail: 'book@example.com', guestReplyEmail: 'hello@example.com' };

  it('is false for the same values', () => {
    expect(changesSensitiveFields(base, { ...base })).toBe(false);
  });

  it('ignores spacing and case in an IBAN or BIC and case or spacing around an email', () => {
    expect(changesSensitiveFields(base, { ...base, iban: 'fr760000', bic: 'abcdfr22', bookingEmail: ' Book@Example.com ' })).toBe(false);
  });

  it.each(['iban', 'bic', 'bankAccountName', 'contactEmail', 'bookingEmail', 'guestReplyEmail'] as const)('is true when %s changes', (field) => {
    expect(changesSensitiveFields(base, { ...base, [field]: 'something-else-1' })).toBe(true);
  });
});

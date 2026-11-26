/**
 * @file packages/ui/src/password/password-policy.test.ts
 * @shared Every rule of the staff password policy
 */

import { describe, expect, it } from 'vitest';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordChecklist, validatePassword } from './password-policy';

const GOOD = 'Lakeside-Morning-8';

function failing(password: string, email?: string): string[] {
  return passwordChecklist(password, { email })
    .filter((rule) => !rule.ok)
    .map((rule) => rule.id);
}

describe('validatePassword', () => {
  it('accepts a password with a capital, a small letter, a number and enough length', () => {
    expect(validatePassword(GOOD)).toEqual({ ok: true, problems: [] });
  });

  it('does not need a symbol', () => {
    expect(validatePassword('LakesideMorning8').ok).toBe(true);
  });

  it('turns every broken rule into one plain sentence, all at once', () => {
    expect(validatePassword('xyz').problems).toEqual(['Use at least 10 characters', 'Add a capital letter', 'Add a number']);
    expect(validatePassword('').problems).toEqual([
      'Use at least 10 characters',
      'Add a capital letter',
      'Add a small letter',
      'Add a number',
    ]);
  });
});

describe('length', () => {
  it('exports the limits', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(10);
    expect(PASSWORD_MAX_LENGTH).toBe(200);
  });

  it.each([
    [9, false],
    [10, true],
    [11, true],
    [200, true],
    [201, false],
  ])('a %i character password passes the length rule: %s', (length, ok) => {
    const password = `Aa1${'x'.repeat(length - 3)}`;
    expect(password).toHaveLength(length);
    expect(failing(password).includes('length')).toBe(!ok);
  });

  it('says "at most 200" for a too long one and "at least 10" for a too short one', () => {
    expect(validatePassword(`Aa1${'x'.repeat(198)}`).problems).toEqual(['Use at most 200 characters']);
    expect(validatePassword('Aa1xxxxxx').problems).toEqual(['Use at least 10 characters']);
  });

  it('refuses a password that is only spaces, however long', () => {
    const verdict = validatePassword(' '.repeat(12));

    expect(verdict.ok).toBe(false);
    expect(verdict.problems).toContain('Use more than spaces');
  });

  it('counts spaces inside a passphrase', () => {
    expect(validatePassword('Correct Horse 9').ok).toBe(true);
  });
});

describe('letters and numbers', () => {
  it('needs a capital letter', () => {
    expect(failing('lakeside-morning-8')).toEqual(['upper']);
  });

  it('needs a small letter', () => {
    expect(failing('LAKESIDE-MORNING-8')).toEqual(['lower']);
  });

  it('needs a number', () => {
    expect(failing('Lakeside-Morning-x')).toEqual(['number']);
  });

  it('counts accented and non-Latin letters and digits', () => {
    expect(validatePassword('Éléphant-Été-7').ok).toBe(true);
    expect(failing('Ωmegaαβγδεζ1')).toEqual([]);
    expect(failing('Żółćżółć-٣-Ab')).toEqual([]);
    expect(failing('ÉÉÉÉÉÉÉÉÉÉ1')).toEqual(['lower']);
  });
});

describe('common passwords', () => {
  it.each(['Password123', 'Welcome123', 'Qwerty123456', 'Admin1234', 'Letmein2024!', 'Humphreys2026', 'Passw0rd!!'])(
    'refuses %s',
    (password) => {
      expect(failing(password)).toContain('notCommon');
    },
  );

  it('ignores case and trailing digits and symbols', () => {
    expect(failing('PASSWORD')).toContain('notCommon');
    expect(failing('Password1!2@3#')).toContain('notCommon');
    expect(failing('Dragon-9999')).toContain('notCommon');
  });

  it('allows a longer password that merely starts with a common word', () => {
    expect(failing('Password-Horse-Staple-9')).toEqual([]);
    expect(failing('Dragonfly-Meadow-42')).toEqual([]);
  });

  it('does not treat an empty password as common', () => {
    expect(failing('')).not.toContain('notCommon');
  });
});

describe('the email name', () => {
  it('refuses a password containing the first part of the email, any case', () => {
    expect(failing('Boss-Is-Great-1', 'boss@example.com')).toEqual(['notEmail']);
    expect(failing('xxBOSSxx-Lake-9', 'Boss@Example.com')).toEqual(['notEmail']);
  });

  it('does not mind the domain', () => {
    expect(failing('Example-Lake-Morning-9', 'boss@example.com')).toEqual([]);
  });

  it('only counts an email name of three characters or more', () => {
    expect(failing('Ab-Lakeside-Morning-8', 'ab@example.com')).toEqual([]);
    expect(failing('Abc-Lakeside-Morning-8', 'abc@example.com')).toEqual(['notEmail']);
  });

  it('passes when no email is given or the email has no name', () => {
    expect(failing('Boss-Is-Great-1')).toEqual([]);
    expect(failing('Boss-Is-Great-1', '')).toEqual([]);
    expect(failing('Boss-Is-Great-1', '@example.com')).toEqual([]);
  });
});

describe('passwordChecklist', () => {
  it('lists the six rules in a fixed order with a label each', () => {
    const rules = passwordChecklist('');

    expect(rules.map((rule) => rule.id)).toEqual(['length', 'upper', 'lower', 'number', 'notEmail', 'notCommon']);
    expect(rules.map((rule) => rule.label)).toEqual([
      'At least 10 characters',
      'A capital letter',
      'A small letter',
      'A number',
      'Does not contain your email name',
      'Not a common password',
    ]);
  });

  it('marks everything ok for a good password and the same verdict as validatePassword', () => {
    expect(passwordChecklist(GOOD, { email: 'boss@example.com' }).every((rule) => rule.ok)).toBe(true);
    const weak = passwordChecklist('xyz');
    expect(weak.filter((rule) => !rule.ok).map((rule) => rule.problem)).toEqual(validatePassword('xyz').problems);
  });

  it('keeps the documented development login valid except for the email rule (so the API only warns, in development)', () => {
    expect(failing('AtlanticOwner1!', 'owner@atlantic.example')).toEqual(['notEmail']);
    expect(failing('AtlanticOwner1!')).toEqual([]);
  });
});

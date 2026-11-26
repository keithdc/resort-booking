/**
 * @file apps/api/src/shared/validation/password-policy.spec.ts
 * @shared The API's copy of the password policy: same rules as the browser's, and provably the same file
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordChecklist, validatePassword } from './password-policy';

/** The file without its first comment block (only the @file line differs between the two copies). */
function body(path: string): string {
  return readFileSync(path, 'utf8').replace(/^\/\*\*[\s\S]*?\*\//, '').trim();
}

describe('password policy (API copy)', () => {
  it('is the same code as the browser copy in packages/ui (they must not drift)', () => {
    const api = body(join(__dirname, 'password-policy.ts'));
    const ui = body(join(__dirname, '../../../../../packages/ui/src/password/password-policy.ts'));

    expect(api).toBe(ui);
  });

  it('accepts a password that meets every rule', () => {
    expect(validatePassword('Lakeside-Morning-8')).toEqual({ ok: true, problems: [] });
  });

  it('lists every broken rule at once, in plain language', () => {
    expect(validatePassword('xyz').problems).toEqual(['Use at least 10 characters', 'Add a capital letter', 'Add a number']);
  });

  it('knows the length limits', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(10);
    expect(PASSWORD_MAX_LENGTH).toBe(200);
    expect(validatePassword(`Aa1${'x'.repeat(6)}`).ok).toBe(false);
    expect(validatePassword(`Aa1${'x'.repeat(7)}`).ok).toBe(true);
    expect(validatePassword(`Aa1${'x'.repeat(197)}`).ok).toBe(true);
    expect(validatePassword(`Aa1${'x'.repeat(198)}`).problems).toEqual(['Use at most 200 characters']);
  });

  it('checks the email name only when it is given and long enough to mean something', () => {
    expect(validatePassword('Boss-Is-Great-1', { email: 'boss@example.com' }).ok).toBe(false);
    expect(validatePassword('Boss-Is-Great-1').ok).toBe(true);
    expect(validatePassword('Aaaa-Is-Great-1', { email: 'a@example.com' }).ok).toBe(true);
    expect(passwordChecklist('x', { email: 'boss@example.com' }).map((rule) => rule.id)).toEqual([
      'length', 'upper', 'lower', 'number', 'notEmail', 'notCommon',
    ]);
  });
});

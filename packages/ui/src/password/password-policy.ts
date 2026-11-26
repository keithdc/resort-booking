/**
 * @file packages/ui/src/password/password-policy.ts
 * @shared The staff password rules, in plain language (pure, no dependencies)
 * @dependencies none
 *
 * ONE source of truth for the browser. The API cannot import workspace packages at run time, so it keeps a
 * byte-for-byte copy (apps/api/src/shared/validation/password-policy.ts) and a test fails if they drift.
 * Only the first comment block differs.
 */

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 200;

/** Anything else the rules should know: the sign-in email, so a password cannot be built from it. */
export interface PasswordContext {
  email?: string | undefined;
}

export type PasswordRuleId = 'length' | 'upper' | 'lower' | 'number' | 'notEmail' | 'notCommon';

export interface PasswordRuleResult {
  id: PasswordRuleId;
  /** What the rule asks for, as a checklist line ("At least 10 characters"). */
  label: string;
  /** What to tell the person when it is not met ("Use at least 10 characters"). */
  problem: string;
  ok: boolean;
}

export interface PasswordValidation {
  ok: boolean;
  problems: string[];
}

/** The email name must be this long before it counts: "a@x.com" must not ban every password with an "a". */
const MIN_EMAIL_NAME_LENGTH = 3;

/**
 * The most common weak passwords, lower case. A password is rejected when it, or it without trailing digits
 * and symbols, is one of these ("Password123!" becomes "password"). Includes words from this product.
 */
const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  'password', 'passw0rd', 'p@ssw0rd', 'p@ssword', 'pass', 'passwort', 'motdepasse', 'contrasena', '12345678',
  'qwerty', 'qwertyuiop', 'qwertz', 'azerty', 'azertyuiop', 'asdfgh', 'asdfghjkl', 'zxcvbn', 'zxcvbnm', 'qazwsx',
  'qazwsxedc', '1q2w3e', '1q2w3e4r', 'abc', 'abcd', 'abcde', 'abcdef', 'abcdefg', 'abcdefgh', 'abcdefghij',
  'admin', 'administrator', 'root', 'user', 'guest', 'owner', 'staff', 'manager', 'login', 'welcome', 'welcome1',
  'letmein', 'changeme', 'change', 'default', 'secret', 'temp', 'temporary', 'test', 'testing', 'tester', 'demo',
  'iloveyou', 'monkey', 'dragon', 'master', 'shadow', 'superman', 'batman', 'football', 'baseball', 'basketball',
  'soccer', 'hockey', 'sunshine', 'princess', 'flower', 'lovely', 'jesus', 'charlie', 'michael', 'jennifer',
  'jordan', 'hunter', 'ranger', 'harley', 'ginger', 'summer', 'winter', 'spring', 'autumn', 'freedom', 'whatever',
  'trustno', 'trustno1', 'starwars', 'pokemon', 'hello', 'hello123', 'computer', 'internet', 'cheese', 'killer',
  'mustang', 'access', 'secure', 'biteme', 'buster', 'thomas', 'robert', 'daniel', 'andrea', 'joshua', 'pepper',
  'maggie', 'merlin', 'london', 'paris', 'france', 'holiday', 'vacation', 'booking', 'resort', 'hotel', 'hospitality',
  'humphreys', 'atlantic', 'alpine', 'lakechalet', 'direct', 'company', 'business', 'office', 'reception',
]);

/** Letters, digits and the like are matched with Unicode classes so accented and non-Latin letters count. */
const UPPER = /\p{Lu}/u;
const LOWER = /\p{Ll}/u;
const DIGIT = /\p{Nd}/u;

/**
 * Per-rule results for a checklist next to the field. Empty text fails every rule that needs content, and
 * the two "must not be" rules pass until there is something to compare.
 */
export function passwordChecklist(password: string, context: PasswordContext = {}): PasswordRuleResult[] {
  return [
    {
      id: 'length',
      label: `At least ${String(PASSWORD_MIN_LENGTH)} characters`,
      problem: lengthProblem(password),
      ok: password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH && password.trim() !== '',
    },
    { id: 'upper', label: 'A capital letter', problem: 'Add a capital letter', ok: UPPER.test(password) },
    { id: 'lower', label: 'A small letter', problem: 'Add a small letter', ok: LOWER.test(password) },
    { id: 'number', label: 'A number', problem: 'Add a number', ok: DIGIT.test(password) },
    {
      id: 'notEmail',
      label: 'Does not contain your email name',
      problem: 'Do not use the first part of your email in the password',
      ok: !containsEmailName(password, context.email),
    },
    {
      id: 'notCommon',
      label: 'Not a common password',
      problem: 'This is a very common password. Choose something less guessable',
      ok: !isCommonPassword(password),
    },
  ];
}

/**
 * The verdict and, for a rejection, every problem in plain language (empty when ok).
 */
export function validatePassword(password: string, context: PasswordContext = {}): PasswordValidation {
  const problems = passwordChecklist(password, context)
    .filter((rule): boolean => !rule.ok)
    .map((rule): string => rule.problem);
  return { ok: problems.length === 0, problems };
}

function lengthProblem(password: string): string {
  if (password.length > PASSWORD_MAX_LENGTH) {
    return `Use at most ${String(PASSWORD_MAX_LENGTH)} characters`;
  }
  if (password.length >= PASSWORD_MIN_LENGTH && password.trim() === '') {
    return 'Use more than spaces';
  }
  return `Use at least ${String(PASSWORD_MIN_LENGTH)} characters`;
}

function containsEmailName(password: string, email: string | undefined): boolean {
  if (email === undefined) {
    return false;
  }
  const name = email.trim().toLowerCase().split('@')[0] ?? '';
  return name.length >= MIN_EMAIL_NAME_LENGTH && password.toLowerCase().includes(name);
}

function isCommonPassword(password: string): boolean {
  const lower = password.trim().toLowerCase();
  if (lower === '') {
    return false;
  }
  const withoutTail = lower.replace(/[\d\p{P}\p{S}\s]+$/u, '');
  return COMMON_PASSWORDS.has(lower) || (withoutTail !== '' && COMMON_PASSWORDS.has(withoutTail));
}

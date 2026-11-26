/**
 * @file apps/api/src/shared/privacy/privacy-cli-args.ts
 * @shared Parsing the command line of the privacy commands (strict: an unknown flag is an error, never ignored)
 * @dependencies none
 */

export type PrivacyCommand = 'retention' | 'erase-guest' | 'export-guest' | 'erase-staff' | 'reapply-erasures';

export interface PrivacyArgs {
  command: PrivacyCommand;
  apply: boolean;
  email: string | null;
  out: string | null;
  forceFuture: boolean;
  operator: string | null;
}

const COMMANDS: readonly PrivacyCommand[] = ['retention', 'erase-guest', 'export-guest', 'erase-staff', 'reapply-erasures'];
const NEEDS_EMAIL: readonly PrivacyCommand[] = ['erase-guest', 'export-guest', 'erase-staff'];
const ALLOWED_FLAGS: Readonly<Record<PrivacyCommand, readonly string[]>> = {
  retention: ['--apply', '--operator'],
  'erase-guest': ['--email', '--apply', '--force-future', '--operator'],
  'export-guest': ['--email', '--out'],
  'erase-staff': ['--email', '--apply', '--operator'],
  'reapply-erasures': ['--apply', '--operator'],
};
const VALUE_FLAGS: readonly string[] = ['--email', '--out', '--operator'];

/**
 * Reads `argv` after the script name: the command, then flags. `--flag value` and `--flag=value` both work. Throws a
 * message that says what to fix.
 */
export function parsePrivacyArgs(argv: readonly string[]): PrivacyArgs {
  const [name, ...rest] = argv;
  const command = COMMANDS.find((candidate: PrivacyCommand): boolean => candidate === name);
  if (command === undefined) {
    throw new Error(`Unknown command "${name ?? ''}". Use one of: ${COMMANDS.join(', ')}.`);
  }
  const values = new Map<string, string>();
  const switches = new Set<string>();
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index] ?? '';
    if (token === '--') {
      continue;
    }
    const equals = token.indexOf('=');
    const flag = equals === -1 ? token : token.slice(0, equals);
    if (!ALLOWED_FLAGS[command].includes(flag)) {
      throw new Error(`${command} does not take "${flag}". Allowed: ${ALLOWED_FLAGS[command].join(' ')}.`);
    }
    if (VALUE_FLAGS.includes(flag)) {
      const value = equals === -1 ? rest[(index += 1)] : token.slice(equals + 1);
      if (value === undefined || value === '' || value.startsWith('--')) {
        throw new Error(`${flag} needs a value.`);
      }
      values.set(flag, value);
    } else {
      if (equals !== -1) {
        throw new Error(`${flag} takes no value.`);
      }
      switches.add(flag);
    }
  }
  const email = values.get('--email') ?? null;
  if (NEEDS_EMAIL.includes(command) && email === null) {
    throw new Error(`${command} needs --email <address>.`);
  }
  if (command === 'export-guest' && values.get('--out') === undefined) {
    throw new Error('export-guest needs --out <file>: the export is never printed to the terminal.');
  }
  return {
    command,
    apply: switches.has('--apply'),
    email,
    out: values.get('--out') ?? null,
    forceFuture: switches.has('--force-future'),
    operator: values.get('--operator') ?? null,
  };
}

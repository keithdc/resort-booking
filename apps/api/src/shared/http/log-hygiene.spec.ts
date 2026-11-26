/**
 * @file apps/api/src/shared/http/log-hygiene.spec.ts
 * @shared Log calls never interpolate personal data or secrets (docs/13 R2-11, R2-24)
 *
 * A lint-style check over the API sources: every `logger.<level>(...)` / `console.<level>(...)` call is read, and a
 * `${...}` placeholder that names an email, IP, token, password, phone, bank or free-text field fails the build.
 * Log the id, a salted hash (see `AuditService.hashIp`) or the request id instead. The scanner is itself tested
 * on small samples so it cannot silently stop matching.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SENSITIVE_NAME =
  /\b(email|emails|bookerEmail|recipient|ip|ipAddress|clientIp|token|sessionToken|password|passwordHash|secret|phone|iban|bic|guestName|bookerName|guestNote|note|otp|recoveryCode)\b/i;

/** The argument text of every log call in `source` (up to the statement's closing `);`). */
export function logCallArguments(source: string): string[] {
  const calls: string[] = [];
  const start = /\b(?:logger|this\.logger|console)\.(?:log|warn|error|debug|verbose|fatal)\(/g;
  let match = start.exec(source);
  while (match !== null) {
    const end = source.indexOf(');', match.index);
    calls.push(source.slice(match.index, end === -1 ? undefined : end));
    match = start.exec(source);
  }
  return calls;
}

/** The sensitive names found inside `${...}` placeholders of one call. */
export function sensitivePlaceholders(call: string): string[] {
  const found: string[] = [];
  for (const placeholder of call.matchAll(/\$\{([^}]*)\}/g)) {
    const expression = placeholder[1] ?? '';
    const name = SENSITIVE_NAME.exec(expression);
    if (name !== null) {
      found.push(expression.trim());
    }
  }
  return found;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name: string): string[] => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }
    return name.endsWith('.ts') && !name.endsWith('.spec.ts') ? [path] : [];
  });
}

describe('log hygiene scanner', () => {
  it('flags an email, an IP and a token placed in a log message', () => {
    const bad = [
      'this.logger.warn(`login failed for ${email}`);',
      'logger.log(`from ${context.ip} ok`);',
      'this.logger.error(`bad ${request.sessionToken}`);',
      'this.logger.warn(`reset for ${staff.email} by ${actor.name}`);',
    ];

    for (const line of bad) {
      expect(logCallArguments(line).flatMap(sensitivePlaceholders)).not.toEqual([]);
    }
  });

  it('accepts ids, counts, hashes and request ids', () => {
    const good = [
      'this.logger.log(`login.success staff=${staff.id} ${who}`);',
      'this.logger.warn(`two_factor.failed staff=${staff.id} scope=${scope}`);',
      'logger.warn(`${options.code} check skipped: Redis unavailable`);',
    ];

    for (const line of good) {
      expect(logCallArguments(line).flatMap(sensitivePlaceholders)).toEqual([]);
    }
  });

  it('reads a multi-line call', () => {
    const source = "this.logger.error(\n  `Refund ${refundId} for ${booking.bookerEmail}`,\n  stack,\n);";

    expect(logCallArguments(source).flatMap(sensitivePlaceholders)).toEqual(['booking.bookerEmail']);
  });
});

describe('API log statements', () => {
  const root = join(__dirname, '../..');
  const files = sourceFiles(root);

  it('scans the API sources', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.flatMap((file) => logCallArguments(readFileSync(file, 'utf8'))).length).toBeGreaterThan(30);
  });

  it('never interpolates an email, IP, token, password, phone, bank detail or free text', () => {
    const offenders = files.flatMap((file) =>
      logCallArguments(readFileSync(file, 'utf8')).flatMap((call) => sensitivePlaceholders(call).map((expression) => `${file.slice(root.length + 1)}: \${${expression}}`)),
    );

    expect(offenders).toEqual([]);
  });
});

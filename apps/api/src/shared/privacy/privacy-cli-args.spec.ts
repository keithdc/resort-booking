/**
 * @file apps/api/src/shared/privacy/privacy-cli-args.spec.ts
 * The command line: dry run by default, strict flags, no export to the terminal.
 */

import { parsePrivacyArgs } from './privacy-cli-args';

describe('parsePrivacyArgs', () => {
  it('defaults to a dry run', () => {
    expect(parsePrivacyArgs(['retention']).apply).toBe(false);
    expect(parsePrivacyArgs(['retention', '--apply']).apply).toBe(true);
  });

  it('reads --email in both spellings and ignores the npm "--" separator', () => {
    expect(parsePrivacyArgs(['erase-guest', '--', '--email', 'a@b.co']).email).toBe('a@b.co');
    expect(parsePrivacyArgs(['erase-guest', '--email=a@b.co', '--force-future']).forceFuture).toBe(true);
  });

  it('requires an email where one is needed', () => {
    expect(() => parsePrivacyArgs(['erase-guest'])).toThrow(/needs --email/);
    expect(() => parsePrivacyArgs(['erase-staff', '--apply'])).toThrow(/needs --email/);
  });

  it('requires --out for an export, so it can never print to the terminal', () => {
    expect(() => parsePrivacyArgs(['export-guest', '--email', 'a@b.co'])).toThrow(/needs --out/);
    expect(parsePrivacyArgs(['export-guest', '--email', 'a@b.co', '--out', '/tmp/x.json']).out).toBe('/tmp/x.json');
  });

  it('refuses unknown commands, unknown flags, a flag for another command and a missing value', () => {
    expect(() => parsePrivacyArgs(['purge'])).toThrow(/Unknown command/);
    expect(() => parsePrivacyArgs(['retention', '--dry'])).toThrow(/does not take/);
    expect(() => parsePrivacyArgs(['export-guest', '--email', 'a@b.co', '--out', 'x', '--apply'])).toThrow(/does not take/);
    expect(() => parsePrivacyArgs(['erase-guest', '--email'])).toThrow(/needs a value/);
    expect(() => parsePrivacyArgs(['retention', '--apply=yes'])).toThrow(/takes no value/);
  });
});

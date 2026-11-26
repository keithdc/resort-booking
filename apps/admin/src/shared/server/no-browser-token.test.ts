// @vitest-environment node
/**
 * @file apps/admin/src/shared/server/no-browser-token.test.ts
 * @shared Guard for docs/10 S-11: no admin code puts the staff session token where page scripts can read it
 * @dependencies node:fs
 *
 * A grep-style check over the admin source. It fails when someone adds browser storage, a readable cookie, a direct
 * API-origin call or a token header outside the few files that are meant to touch them.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', '..');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name: string): string[] => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      return sourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const FILES = sourceFiles(SRC).map((path: string): { name: string; text: string } => ({
  name: relative(SRC, path).split('\\').join('/'),
  text: readFileSync(path, 'utf8'),
}));

function filesMatching(pattern: RegExp): string[] {
  return FILES.filter((file): boolean => pattern.test(file.text)).map((file): string => file.name).sort();
}

describe('S-11: the staff token never reaches page code', () => {
  it('scans the whole admin source', () => {
    expect(FILES.length).toBeGreaterThan(100);
  });

  it('uses browser storage only for the activity time and the sidebar fold, never for a token', () => {
    expect(filesMatching(/\b(localStorage|sessionStorage|indexedDB)\b/)).toEqual([
      'shared/hooks/use-sidebar-collapsed.ts',
      'shared/services/activity-clock.ts',
    ]);
    for (const name of ['shared/hooks/use-sidebar-collapsed.ts', 'shared/services/activity-clock.ts']) {
      expect(FILES.find((file): boolean => file.name === name)?.text, name).not.toMatch(/staff_token|STAFF_TOKEN|sessionToken/);
    }
  });

  it('never reads or writes document.cookie (the cookie is httpOnly and set by the server)', () => {
    expect(filesMatching(/document\.cookie/)).toEqual([]);
  });

  it('sends the x-staff-token header only from server code', () => {
    expect(filesMatching(/x-staff-token/)).toEqual(['shared/server/bff-http.ts', 'shared/services/api-client.ts']);
  });

  it('names the cookie only where the server reads or sets it', () => {
    expect(filesMatching(/staff_token/)).toEqual(['middleware.ts', 'shared/server/bff-http.ts', 'shared/services/api-client.ts']);
  });

  it('never points a browser fetch at the API origin: the API URL is read in one server-side helper', () => {
    expect(filesMatching(/NEXT_PUBLIC_API_URL|process\.env\.API_URL/)).toEqual(['shared/server/bff-http.ts']);
  });

  it('has no helper left that stores a token handed over by the page', () => {
    expect(filesMatching(/persistStaffSession|storeStaffToken|readStoredStaffToken|STAFF_TOKEN_STORAGE_KEY/)).toEqual([]);
  });
});

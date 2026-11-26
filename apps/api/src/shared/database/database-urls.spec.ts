/**
 * @file apps/api/src/shared/database/database-urls.spec.ts
 * @shared Connection URL helpers
 */

import { databaseNameOf, describeUrl, urlWithCredentials } from './database-urls';

describe('database URL helpers', () => {
  const ADMIN = 'postgres://resort:resort@localhost:5433/resort_booking';

  it('derives a role URL from the admin URL, escaping special characters in the password', () => {
    const url = urlWithCredentials(ADMIN, 'resort_app', 'p@ss/w:rd#1');
    const parsed = new URL(url);

    expect(parsed.username).toBe('resort_app');
    expect(decodeURIComponent(parsed.password)).toBe('p@ss/w:rd#1');
    expect(parsed.host).toBe('localhost:5433');
    expect(parsed.pathname).toBe('/resort_booking');
  });

  it('can point the derived URL at another database', () => {
    expect(new URL(urlWithCredentials(ADMIN, 'a', 'b', 'throwaway')).pathname).toBe('/throwaway');
  });

  it('reads the database name, or null when there is none', () => {
    expect(databaseNameOf(ADMIN)).toBe('resort_booking');
    expect(databaseNameOf('postgres://u:p@h:5432')).toBeNull();
    expect(databaseNameOf('postgres://u:p@h:5432/')).toBeNull();
  });

  it('describes a URL without its password', () => {
    expect(describeUrl(urlWithCredentials(ADMIN, 'resort_app', 'sup3rsecret'))).toBe('resort_app@localhost:5433/resort_booking');
    expect(describeUrl('garbage')).toBe('(not a valid URL)');
  });
});

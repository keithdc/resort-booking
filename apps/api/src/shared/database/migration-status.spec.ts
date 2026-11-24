/**
 * @file apps/api/src/shared/database/migration-status.spec.ts
 * @shared Migration status comparison
 */

import { compareMigrations, describeStaleBuild } from './migration-status';

describe('compareMigrations', () => {
  it('reports nothing when files and database match', () => {
    expect(compareMigrations(['001.sql', '002.sql'], ['002.sql', '001.sql'])).toEqual({ pending: [], unknown: [] });
  });

  it('lists files the database has not applied as pending', () => {
    expect(compareMigrations(['001.sql', '002.sql', '003.sql'], ['001.sql'])).toEqual({
      pending: ['002.sql', '003.sql'],
      unknown: [],
    });
  });

  it('lists applied migrations this build does not ship as unknown (stale code)', () => {
    expect(compareMigrations(['001.sql'], ['001.sql', '023.sql', '022.sql'])).toEqual({
      pending: [],
      unknown: ['022.sql', '023.sql'],
    });
  });

  it('handles an empty database and an empty build', () => {
    expect(compareMigrations([], [])).toEqual({ pending: [], unknown: [] });
    expect(compareMigrations(['001.sql'], [])).toEqual({ pending: ['001.sql'], unknown: [] });
  });
});

describe('describeStaleBuild', () => {
  it('names the unknown migrations and the fix', () => {
    const message = describeStaleBuild(['022.sql', '023.sql']);
    expect(message).toContain('022.sql, 023.sql');
    expect(message).toContain('start:dev');
  });
});

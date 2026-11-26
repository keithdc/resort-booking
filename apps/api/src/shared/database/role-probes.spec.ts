/**
 * @file apps/api/src/shared/database/role-probes.spec.ts
 * @shared The role probes and how they judge a result (no database: a fake connection)
 */

import { ROLE_PROBES, runProbes } from './role-probes';

type Behaviour = (sql: string) => { code?: string; message?: string } | null;

/** A fake connection: every statement goes through `behave`; null means it ran fine. */
function fakeClient(behave: Behaviour): { client: { query: (sql: string) => Promise<unknown> }; log: string[] } {
  const log: string[] = [];
  return {
    log,
    client: {
      query: async (sql: string): Promise<unknown> => {
        log.push(sql);
        if (sql === 'BEGIN' || sql === 'ROLLBACK') {
          return {};
        }
        const failure = behave(sql);
        if (failure !== null) {
          throw Object.assign(new Error(failure.message ?? 'denied'), { code: failure.code });
        }
        return {};
      },
    },
  };
}

describe('ROLE_PROBES', () => {
  it('covers the dangerous statements for the app role', () => {
    const names = ROLE_PROBES.filter((probe) => probe.role === 'app').map((probe) => probe.sql).join('\n');

    for (const needle of ['CREATE TABLE', 'DROP TABLE', 'ALTER TABLE', 'TRUNCATE', 'DROP SCHEMA', 'INSERT INTO schema_migrations', 'DELETE FROM schema_migrations', 'CREATE ROLE', 'pg_sleep']) {
      expect(names).toContain(needle);
    }
  });

  it('covers personal and bank columns for the read-only role', () => {
    const sql = ROLE_PROBES.filter((probe) => probe.role === 'readonly').map((probe) => probe.sql).join('\n');

    for (const needle of ['booker_email FROM inventory_blocks', 'booker_email FROM report_bookings', 'booker_phone', 'iban FROM organizations', 'iban FROM report_organizations', 'password_hash']) {
      expect(sql).toContain(needle);
    }
  });
});

describe('runProbes', () => {
  it('passes when allowed statements run and forbidden ones fail with the expected code', async () => {
    const { client } = fakeClient((sql) => {
      if (/^(SELECT count|INSERT INTO organizations|UPDATE organizations|DELETE FROM organizations|SELECT id FROM schema_migrations)/.test(sql)) {
        return null;
      }
      return { code: sql.includes('pg_sleep') ? '57014' : '42501' };
    });

    const outcomes = await runProbes(client, 'app');

    expect(outcomes.length).toBe(ROLE_PROBES.filter((probe) => probe.role === 'app').length);
    expect(outcomes.filter((outcome) => !outcome.ok)).toEqual([]);
  });

  it('fails a probe that was wrongly allowed (a role that is too powerful)', async () => {
    const { client } = fakeClient(() => null);

    const outcomes = await runProbes(client, 'app', { skipSlow: true });
    const failed = outcomes.filter((outcome) => !outcome.ok).map((outcome) => outcome.probe.name);

    expect(failed).toContain('app cannot create a table');
    expect(failed).toContain('app cannot write the migration ledger');
    expect(outcomes.find((outcome) => outcome.probe.name === 'app cannot create a table')?.detail).toMatch(/WRONGLY ALLOWED/);
  });

  it('fails a probe that was refused for the wrong reason or an allowed one that was refused', async () => {
    const { client } = fakeClient((sql) => (sql.startsWith('SELECT count') ? { code: '42501' } : { code: '42P01', message: 'relation does not exist' }));

    const outcomes = await runProbes(client, 'readonly');

    expect(outcomes.find((outcome) => outcome.probe.name === 'read-only can read the booking report')?.ok).toBe(false);
    expect(outcomes.find((outcome) => outcome.probe.name === 'read-only cannot write')?.ok).toBe(false);
  });

  it('expects a missing column (not a missing right) when a view leaves personal data out', async () => {
    const { client } = fakeClient((sql) => (sql.includes('FROM report_') && !sql.startsWith('SELECT count') ? { code: '42703' } : sql.startsWith('SELECT count') ? null : { code: '42501' }));

    const outcomes = await runProbes(client, 'readonly');

    expect(outcomes.filter((outcome) => !outcome.ok)).toEqual([]);
  });

  it('rolls every probe back, so a wrongly allowed statement changes nothing', async () => {
    const { client, log } = fakeClient(() => null);

    await runProbes(client, 'app', { skipSlow: true });

    expect(log.filter((sql) => sql === 'BEGIN')).toHaveLength(log.filter((sql) => sql === 'ROLLBACK').length);
    expect(log).not.toContain('COMMIT');
  });

  it('can skip the slow timeout probe', async () => {
    const { client, log } = fakeClient(() => null);

    await runProbes(client, 'app', { skipSlow: true });

    expect(log.some((sql) => sql.includes('pg_sleep'))).toBe(false);
  });
});

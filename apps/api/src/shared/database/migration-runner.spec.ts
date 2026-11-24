/**
 * @file apps/api/src/shared/database/migration-runner.spec.ts
 * @shared Stale-build safeguard in the migration runner
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Test } from '@nestjs/testing';
import { DatabaseService } from './database.service';
import { MigrationRunner } from './migration-runner';

const shipped = readdirSync(join(__dirname, '../../migrations')).filter((n: string): boolean => n.endsWith('.sql'));

async function build(applied: string[]): Promise<MigrationRunner> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      MigrationRunner,
      {
        provide: DatabaseService,
        useValue: {
          query: async (text: string, params: string[] = []): Promise<{ rows: { id: string }[]; rowCount: number }> => {
            if (text.includes('WHERE id')) {
              const hit = applied.includes(params[0] ?? '');
              return { rows: hit ? [{ id: params[0] ?? '' }] : [], rowCount: hit ? 1 : 0 };
            }
            if (text.includes('SELECT id FROM schema_migrations')) {
              return { rows: applied.map((id: string): { id: string } => ({ id })), rowCount: applied.length };
            }
            return { rows: [], rowCount: 0 };
          },
        },
      },
    ],
  }).compile();
  return moduleRef.get(MigrationRunner);
}

describe('MigrationRunner stale-build safeguard', () => {
  it('reports migrations the database has that this build does not ship', async () => {
    const runner = await build([...shipped, '999_from_a_newer_build.sql']);
    await expect(runner.status()).resolves.toEqual({ pending: [], unknown: ['999_from_a_newer_build.sql'] });
  });

  it('refuses to start when the database is ahead of the code', async () => {
    const runner = await build([...shipped, '999_from_a_newer_build.sql']);
    await expect(runner.onModuleInit()).rejects.toThrow('999_from_a_newer_build.sql');
  });

  it('starts normally when the database matches this build', async () => {
    const runner = await build(shipped);
    await expect(runner.onModuleInit()).resolves.toBeUndefined();
    runner.onModuleDestroy();
  });
});

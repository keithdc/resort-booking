/**
 * @file apps/api/src/modules/health/health.service.spec.ts
 * @feature health
 */

import { Test } from '@nestjs/testing';
import { DatabaseService } from '../../shared/database/database.service';
import { MigrationRunner } from '../../shared/database/migration-runner';
import { RedisService } from '../../shared/redis/redis.service';
import { HealthService } from './health.service';

async function build(postgres: boolean, redis: boolean, unknown: string[]): Promise<HealthService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      HealthService,
      { provide: DatabaseService, useValue: { ping: async (): Promise<boolean> => postgres } },
      { provide: RedisService, useValue: { ping: async (): Promise<boolean> => redis } },
      { provide: MigrationRunner, useValue: { status: async (): Promise<{ pending: string[]; unknown: string[] }> => ({ pending: [], unknown }) } },
    ],
  }).compile();
  return moduleRef.get(HealthService);
}

describe('HealthService', () => {
  it('is ok when dependencies are up and the build matches the schema', async () => {
    const service = await build(true, true, []);
    await expect(service.getStatus()).resolves.toEqual({ ok: true, postgres: true, redis: true, schema: true, schemaAheadOf: [] });
  });

  it('is not ok when the database is ahead of this build', async () => {
    const service = await build(true, true, ['023_x.sql']);
    await expect(service.getStatus()).resolves.toEqual({
      ok: false, postgres: true, redis: true, schema: false, schemaAheadOf: ['023_x.sql'],
    });
  });

  it('does not query migrations when Postgres is down', async () => {
    const service = await build(false, true, ['023_x.sql']);
    await expect(service.getStatus()).resolves.toEqual({ ok: false, postgres: false, redis: true, schema: true, schemaAheadOf: [] });
  });
});

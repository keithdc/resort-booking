/**
 * @file apps/api/src/shared/database/database-safety.service.spec.ts
 * @shared Startup check of the database role
 */

import { Test } from '@nestjs/testing';
import { DatabaseSafetyService } from './database-safety.service';
import { DatabaseService } from './database.service';
import type { RuntimeRoleRow } from './role-safety';

const SAFE: RuntimeRoleRow = { role_name: 'resort_app', is_superuser: false, can_create_databases: false, can_create_roles: false, owned_table_count: 0 };
const SUPER: RuntimeRoleRow = { role_name: 'resort', is_superuser: true, can_create_databases: true, can_create_roles: true, owned_table_count: 21 };

async function build(row: RuntimeRoleRow | null): Promise<DatabaseSafetyService> {
  const moduleRef = await Test.createTestingModule({
    providers: [
      DatabaseSafetyService,
      { provide: DatabaseService, useValue: { query: async (): Promise<{ rows: RuntimeRoleRow[] }> => ({ rows: row === null ? [] : [row] }) } },
    ],
  }).compile();
  return moduleRef.get(DatabaseSafetyService);
}

describe('DatabaseSafetyService', () => {
  const saved = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = saved;
  });

  it('starts in production with the app role', async () => {
    process.env.NODE_ENV = 'production';
    await expect((await build(SAFE)).onModuleInit()).resolves.toBeUndefined();
  });

  it('refuses to start in production when the API runs as a superuser, listing every problem', async () => {
    process.env.NODE_ENV = 'production';
    const service = await build(SUPER);

    await expect(service.onModuleInit()).rejects.toThrow(/Refusing to start, the database role is unsafe[\s\S]*superuser[\s\S]*owns 21 table/);
  });

  it('only warns in development (the single-URL superuser setup keeps working)', async () => {
    process.env.NODE_ENV = 'development';
    const service = await build(SUPER);

    await expect(service.onModuleInit()).resolves.toBeUndefined();
    await expect(service.assess(false)).resolves.toMatchObject({ errors: [] });
  });

  it('treats a missing role row as a production error and a development warning', async () => {
    const service = await build(null);

    await expect(service.assess(true)).resolves.toMatchObject({ errors: [expect.stringContaining('Could not read')] });
    await expect(service.assess(false)).resolves.toMatchObject({ errors: [], warnings: [expect.stringContaining('Could not read')] });
  });
});

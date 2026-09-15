/**
 * @file apps/api/src/shared/database/migration-runner.ts
 * @shared Applies sequential SQL files
 * @dependencies pg, node:fs
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseService } from './database.service';

@Injectable()
export class MigrationRunner implements OnModuleInit {
  private readonly logger = new Logger(MigrationRunner.name);

  public constructor(private readonly database: DatabaseService) {}

  public async onModuleInit(): Promise<void> {
    await this.runPending();
  }

  /**
   * Applies any SQL files that are not yet in schema_migrations.
   */
  public async runPending(): Promise<void> {
    await this.database.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const dir = resolveMigrationsDir();
    const files = (await readdir(dir)).filter((name: string): boolean => name.endsWith('.sql')).sort();

    for (const file of files) {
      const existing = await this.database.query<{ id: string }>(
        'SELECT id FROM schema_migrations WHERE id = $1',
        [file],
      );
      if ((existing.rowCount ?? 0) > 0) {
        continue;
      }

      const sql = await readFile(join(dir, file), 'utf8');
      this.logger.log(`Applying migration ${file}`);
      await this.database.withClient(async (client): Promise<void> => {
        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
          await client.query('COMMIT');
        } catch (error: unknown) {
          await client.query('ROLLBACK');
          throw error;
        }
      });
    }
  }
}

function resolveMigrationsDir(): string {
  const candidates = [
    join(__dirname, '../../migrations'),
    join(process.cwd(), 'src/migrations'),
    join(process.cwd(), 'dist/migrations'),
  ];
  const found = candidates.find((dir: string): boolean => existsSync(dir));
  if (found === undefined) {
    throw new Error('Could not find SQL migrations directory');
  }
  return found;
}

/**
 * @file apps/api/src/shared/database/migration-runner.ts
 * @shared Applies sequential SQL files
 * @dependencies pg, node:fs
 */

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseService } from './database.service';
import { compareMigrations, describeStaleBuild, type MigrationStatus } from './migration-status';

const STALE_CHECK_INTERVAL_MS = 60_000;

@Injectable()
export class MigrationRunner implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MigrationRunner.name);
  private timer: NodeJS.Timeout | null = null;
  private lastUnknown = '';

  public constructor(private readonly database: DatabaseService) {}

  /**
   * Applies pending migrations, refuses to start when this build is older than the database,
   * and keeps watching: another process may migrate the database while this one keeps running old code.
   */
  public async onModuleInit(): Promise<void> {
    await this.runPending();
    const status = await this.status();
    if (status.unknown.length > 0) {
      throw new Error(describeStaleBuild(status.unknown));
    }
    this.timer = setInterval((): void => {
      void this.warnIfStale();
    }, STALE_CHECK_INTERVAL_MS);
    this.timer.unref();
  }

  public onModuleDestroy(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Compares the migration files in this build with what the database has applied.
   */
  public async status(): Promise<MigrationStatus> {
    const files = (await readdir(resolveMigrationsDir()))
      .filter((name: string): boolean => name.endsWith('.sql'));
    const applied = await this.database.query<{ id: string }>('SELECT id FROM schema_migrations');
    return compareMigrations(
      files,
      applied.rows.map((row: { id: string }): string => row.id),
    );
  }

  private async warnIfStale(): Promise<void> {
    try {
      const { unknown } = await this.status();
      const key = unknown.join(',');
      if (key !== this.lastUnknown) {
        this.lastUnknown = key;
        if (unknown.length > 0) {
          this.logger.error(describeStaleBuild(unknown));
        }
      }
    } catch (error: unknown) {
      this.logger.warn(`Schema check failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
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

/**
 * @file apps/api/src/shared/database/migration-runner.ts
 * @shared Applies sequential SQL files
 * @dependencies pg, node:fs
 */

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { buildPoolConfig, readDatabaseSettings, resolveMigrationTarget } from './database-settings';
import { DatabaseService } from './database.service';
import {
  applyPendingMigrations,
  listMigrationFiles,
  pendingMigrations,
  poolExecutor,
  type SqlExecutor,
} from './migration-files';
import { isDevelopment } from '../config/environment';
import { compareMigrations, describeStaleBuild, type MigrationStatus } from './migration-status';
import { DEFAULT_APP_ROLE } from './roles';

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
    if (readDatabaseSettings(process.env).runMigrationsOnStart) {
      await this.runPending();
    } else {
      this.logger.log('RUN_MIGRATIONS_ON_START is off: migrations are applied by `npm run migrate` with the owner role.');
    }
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
    const files = await listMigrationFiles();
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
   * Applies any SQL files that are not yet in schema_migrations. Finding out what is pending only reads, so the
   * least-privilege runtime role can do it; only when something IS pending does this switch to the connection that may
   * change the schema: MIGRATION_DATABASE_URL (the owner role), or in development DATABASE_URL itself.
   */
  public async runPending(): Promise<void> {
    const pending = await pendingMigrations(this.database);
    if (pending.length === 0) {
      return;
    }

    const settings = readDatabaseSettings(process.env);
    const target = resolveMigrationTarget(settings);
    if (!target.separate) {
      this.logger.warn(
        'MIGRATION_DATABASE_URL is not set: migrations run on DATABASE_URL. Fine for development; production needs the owner role (docs/11-database-access.md).',
      );
    }
    const pool = target.separate ? new Pool(buildPoolConfig(target.url, settings, 1)) : null;
    const executor: SqlExecutor = pool === null ? this.database : poolExecutor(pool);
    try {
      await applyPendingMigrations(executor, {
        appRole: process.env.DB_APP_ROLE?.trim() || DEFAULT_APP_ROLE,
        onApplied: (file: string): void => this.logger.log(`Applied migration ${file}`),
        // A developer edits a migration they have not shipped yet: report it. Anywhere else it stops the run (docs/13 R2-22).
        strictChecksums: !isDevelopment(process.env),
        onEdited: (message: string): void => this.logger.warn(message),
      });
    } catch (error: unknown) {
      if (isPermissionDenied(error)) {
        throw new Error(
          'The database role does not have the right to change the schema, and migrations are pending. Set MIGRATION_DATABASE_URL to the owner role, or apply them with `npm run migrate`.',
        );
      }
      throw error;
    } finally {
      if (pool !== null) {
        await pool.end();
      }
    }
  }
}

function isPermissionDenied(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '42501';
}

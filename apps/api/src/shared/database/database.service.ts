/**
 * @file apps/api/src/shared/database/database.service.ts
 * @shared pg Pool wrapper
 * @dependencies pg, @nestjs/config
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { buildPoolConfig, readDatabaseSettings } from './database-settings';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private readonly pool: Pool;

  public constructor(config: ConfigService) {
    // Pool size, timeouts and TLS come from the environment (see database-settings.ts); the role the API connects
    // as (and its statement/lock timeouts) comes from DATABASE_URL.
    const settings = readDatabaseSettings({
      DATABASE_URL: config.getOrThrow<string>('DATABASE_URL'),
      DATABASE_SSL: config.get<string>('DATABASE_SSL'),
      DATABASE_POOL_MAX: config.get<string>('DATABASE_POOL_MAX'),
      DATABASE_CONNECTION_TIMEOUT_MS: config.get<string>('DATABASE_CONNECTION_TIMEOUT_MS'),
      DATABASE_IDLE_TIMEOUT_MS: config.get<string>('DATABASE_IDLE_TIMEOUT_MS'),
      NODE_ENV: config.get<string>('NODE_ENV'),
    });
    this.pool = new Pool(buildPoolConfig(settings.runtimeUrl, settings));
    // An idle connection that the server drops must not crash the process: log it, the pool opens a new one.
    this.pool.on('error', (error: Error): void => {
      this.logger.error(`Idle database connection failed: ${error.message}`);
    });
  }

  /**
   * Runs a parameterized query.
   */
  public async query<T extends QueryResultRow>(
    text: string,
    params: readonly unknown[] = [],
  ): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, [...params]);
  }

  /**
   * Opens a client for a transaction.
   */
  public async withClient<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }

  /**
   * Runs `fn` in one transaction: COMMIT when it returns, ROLLBACK when it throws (the error is passed on). Use it when
   * an action and its audit row must be saved together or not at all (docs/13 R6-05).
   */
  public async withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    return this.withClient(async (client): Promise<T> => {
      await client.query('BEGIN');
      try {
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (error: unknown) {
        await client.query('ROLLBACK').catch((): void => undefined);
        throw error;
      }
    });
  }

  /**
   * True when Postgres accepts a connection.
   */
  public async ping(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  public async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}

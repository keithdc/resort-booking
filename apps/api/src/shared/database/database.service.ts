/**
 * @file apps/api/src/shared/database/database.service.ts
 * @shared pg Pool wrapper
 * @dependencies pg, @nestjs/config
 */

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;

  public constructor(config: ConfigService) {
    this.pool = new Pool({
      connectionString: config.getOrThrow<string>('DATABASE_URL'),
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

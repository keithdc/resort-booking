/**
 * @file apps/api/src/shared/database/database.module.ts
 * @shared PostgreSQL pool
 * @dependencies DatabaseService
 */

import { Global, Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { MigrationRunner } from './migration-runner';

@Global()
@Module({
  providers: [DatabaseService, MigrationRunner],
  exports: [DatabaseService, MigrationRunner],
})
export class DatabaseModule {}

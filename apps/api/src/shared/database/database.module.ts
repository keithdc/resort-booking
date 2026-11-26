/**
 * @file apps/api/src/shared/database/database.module.ts
 * @shared PostgreSQL pool
 * @dependencies DatabaseService
 */

import { Global, Module } from '@nestjs/common';
import { DatabaseSafetyService } from './database-safety.service';
import { DatabaseService } from './database.service';
import { MigrationRunner } from './migration-runner';

@Global()
@Module({
  // DatabaseSafetyService is listed before MigrationRunner so an unsafe production role stops the boot before any DDL.
  providers: [DatabaseService, DatabaseSafetyService, MigrationRunner],
  exports: [DatabaseService, MigrationRunner],
})
export class DatabaseModule {}

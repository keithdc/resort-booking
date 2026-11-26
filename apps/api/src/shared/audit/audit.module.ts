/**
 * @file apps/api/src/shared/audit/audit.module.ts
 * @shared Audit log: service, repository and the interceptor for @Audited routes
 * @dependencies DatabaseService
 */

import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditInterceptor } from './audit.interceptor';
import { AuditRepository } from './audit.repository';
import { AuditService } from './audit.service';

@Global()
@Module({
  providers: [AuditRepository, AuditService, { provide: APP_INTERCEPTOR, useClass: AuditInterceptor }],
  exports: [AuditService],
})
export class AuditModule {}

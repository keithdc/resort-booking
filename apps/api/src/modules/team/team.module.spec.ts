/**
 * @file apps/api/src/modules/team/team.module.spec.ts
 * @feature team
 * The real module wiring resolves (every guard, interceptor and service finds its dependencies), with the
 * database and Redis replaced by empty stand-ins. A wiring mistake that unit tests with mocks cannot see
 * would otherwise only show when the server starts.
 */

import 'reflect-metadata';
import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { AuditInterceptor } from '../../shared/audit/audit.interceptor';
import { AuditModule } from '../../shared/audit/audit.module';
import { AuditService } from '../../shared/audit/audit.service';
import { DatabaseService } from '../../shared/database/database.service';
import { MailModule } from '../../shared/mail/mail.module';
import { RedisService } from '../../shared/redis/redis.service';
import { TenancyModule } from '../../shared/tenancy/tenancy.module';
import { IdentityModule } from '../identity/identity.module';
import { StaffGuard } from '../identity/staff.guard';
import { AuditController } from './audit.controller';
import { RegistrationController } from './registration.controller';
import { TeamController } from './team.controller';
import { TeamModule } from './team.module';
import { TeamService } from './team.service';

@Global()
@Module({
  providers: [
    { provide: DatabaseService, useValue: {} },
    { provide: RedisService, useValue: {} },
  ],
  exports: [DatabaseService, RedisService],
})
class InfrastructureStandIn {}

describe('TeamModule wiring', () => {
  it('resolves every provider, controller and guard it needs', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), InfrastructureStandIn, MailModule, TenancyModule, AuditModule, IdentityModule, TeamModule],
    }).compile();

    expect(moduleRef.get(TeamService)).toBeDefined();
    expect(moduleRef.get(TeamController)).toBeDefined();
    expect(moduleRef.get(RegistrationController)).toBeDefined();
    expect(moduleRef.get(AuditController)).toBeDefined();
    expect(moduleRef.get(AuditService, { strict: false })).toBeDefined();
    expect(moduleRef.get(StaffGuard, { strict: false })).toBeDefined();
    await moduleRef.close();
  });

  it('registers the audit interceptor app-wide (as APP_INTERCEPTOR) and exports the service', () => {
    const providers = Reflect.getMetadata('providers', AuditModule) as unknown[];

    expect(providers).toContainEqual({ provide: APP_INTERCEPTOR, useClass: AuditInterceptor });
    expect(Reflect.getMetadata('exports', AuditModule)).toContain(AuditService);
    expect(Reflect.getMetadata('__module:global__', AuditModule)).toBe(true);
  });
});

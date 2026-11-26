/**
 * @file apps/api/src/modules/team/team.module.ts
 * @feature team
 * @dependencies IdentityModule, AuditModule
 */

import { Module } from '@nestjs/common';
import { IdentityModule } from '../identity/identity.module';
import { AuditController } from './audit.controller';
import { RegistrationController } from './registration.controller';
import { TeamController } from './team.controller';
import { TeamLimiter } from './team-limiter';
import { TeamRepository } from './team.repository';
import { TeamService } from './team.service';

@Module({
  imports: [IdentityModule],
  controllers: [RegistrationController, TeamController, AuditController],
  providers: [TeamService, TeamRepository, TeamLimiter],
})
export class TeamModule {}

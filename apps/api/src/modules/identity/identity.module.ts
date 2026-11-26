/**
 * @file apps/api/src/modules/identity/identity.module.ts
 * @feature identity
 * @dependencies IdentityController, IdentityService, StaffGuard
 */

import { Module } from '@nestjs/common';
import { IdentityController } from './identity.controller';
import { IdentityRepository } from './identity.repository';
import { IdentityService } from './identity.service';
import { LoginLimiter } from './login-limiter';
import { SessionSweeperService } from './session-sweeper.service';
import { StaffGuard } from './staff.guard';
import { TwoFactorController } from './two-factor.controller';
import { TwoFactorCipher } from './two-factor.cipher';
import { TwoFactorLimiter } from './two-factor-limiter';
import { TwoFactorRepository } from './two-factor.repository';
import { TwoFactorService } from './two-factor.service';

@Module({
  controllers: [IdentityController, TwoFactorController],
  providers: [
    IdentityService,
    IdentityRepository,
    StaffGuard,
    LoginLimiter,
    SessionSweeperService,
    TwoFactorService,
    TwoFactorRepository,
    TwoFactorCipher,
    TwoFactorLimiter,
  ],
  exports: [StaffGuard, IdentityService, TwoFactorService],
})
export class IdentityModule {}

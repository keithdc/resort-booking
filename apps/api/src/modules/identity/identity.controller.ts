/**
 * @file apps/api/src/modules/identity/identity.controller.ts
 * @feature identity
 * @dependencies IdentityService
 */

import { Controller, Get, NotFoundException } from '@nestjs/common';
import type { ApiOkBody, Organization } from '@resort-booking/shared-types';
import { IdentityService } from './identity.service';

@Controller('identity')
export class IdentityController {
  public constructor(private readonly identity: IdentityService) {}

  /**
   * Public stub: which operator this deployment belongs to.
   */
  @Get('organization')
  public async getOrganization(): Promise<ApiOkBody<Organization>> {
    const organization = await this.identity.getOrganization();
    if (organization === null) {
      throw new NotFoundException({ message: 'Organization not found', code: 'ORG_NOT_FOUND' });
    }
    return { status: 'ok', data: organization };
  }
}

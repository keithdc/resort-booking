/**
 * @file apps/api/src/shared/tenancy/tenancy.service.ts
 * @shared "Is this row in my organization?" with one answer for everything: 404
 * @dependencies TenancyRepository
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { TenancyRepository } from './tenancy.repository';
import type { TenantResource } from './tenant-scope.decorator';

const NOT_FOUND: Record<TenantResource, { message: string; code: string }> = {
  property: { message: 'Property not found', code: 'PROPERTY_NOT_FOUND' },
  house: { message: 'Stay not found', code: 'HOUSE_NOT_FOUND' },
  ratePeriod: { message: 'Rate period not found', code: 'RATE_PERIOD_NOT_FOUND' },
  discount: { message: 'Discount not found', code: 'DISCOUNT_NOT_FOUND' },
  extra: { message: 'Extra not found', code: 'EXTRA_NOT_FOUND' },
  requestOption: { message: 'Request option not found', code: 'REQUEST_OPTION_NOT_FOUND' },
  booking: { message: 'Booking not found', code: 'BOOKING_NOT_FOUND' },
  refund: { message: 'Refund not found', code: 'REFUND_NOT_FOUND' },
  staffUser: { message: 'Team member not found', code: 'STAFF_NOT_FOUND' },
  staffInvite: { message: 'Invitation not found', code: 'INVITE_NOT_FOUND' },
};

@Injectable()
export class TenancyService {
  public constructor(private readonly tenancy: TenancyRepository) {}

  /**
   * Throws 404 (never 403: a foreign row must look exactly like a missing one) unless the row belongs to the
   * organization.
   */
  public async assertOwned(resource: TenantResource, organizationId: string, id: string): Promise<void> {
    if (!(await this.tenancy.owns(resource, organizationId, id))) {
      throw this.notFound(resource);
    }
  }

  /**
   * The same for a list of ids, checked as a set in one statement. An empty list is fine; one foreign or missing
   * id fails the whole request.
   */
  public async assertAllOwned(resource: TenantResource, organizationId: string, ids: readonly string[]): Promise<void> {
    const distinct = [...new Set(ids)];
    if (distinct.length === 0) {
      return;
    }
    if ((await this.tenancy.countOwned(resource, organizationId, distinct)) !== distinct.length) {
      throw this.notFound(resource);
    }
  }

  private notFound(resource: TenantResource): NotFoundException {
    return new NotFoundException(NOT_FOUND[resource]);
  }
}

/**
 * @file apps/api/src/shared/tenancy/tenancy.service.spec.ts
 * @shared Ownership answers: 404 for anything outside the caller's organization
 */

import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { TenancyRepository } from './tenancy.repository';
import { TenancyService } from './tenancy.service';
import type { TenantResource } from './tenant-scope.decorator';

const CODES: Record<TenantResource, string> = {
  property: 'PROPERTY_NOT_FOUND',
  house: 'HOUSE_NOT_FOUND',
  ratePeriod: 'RATE_PERIOD_NOT_FOUND',
  discount: 'DISCOUNT_NOT_FOUND',
  extra: 'EXTRA_NOT_FOUND',
  requestOption: 'REQUEST_OPTION_NOT_FOUND',
  booking: 'BOOKING_NOT_FOUND',
  refund: 'REFUND_NOT_FOUND',
  staffUser: 'STAFF_NOT_FOUND',
  staffInvite: 'INVITE_NOT_FOUND',
};

describe('TenancyService', () => {
  const owns = jest.fn<Promise<boolean>, [TenantResource, string, string]>();
  const countOwned = jest.fn<Promise<number>, [TenantResource, string, readonly string[]]>();
  let service: TenancyService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [TenancyService, { provide: TenancyRepository, useValue: { owns, countOwned } }],
    }).compile();
    service = moduleRef.get(TenancyService);
  });

  it('lets an owned row through', async () => {
    owns.mockResolvedValue(true);

    await expect(service.assertOwned('house', 'org-A', 'h1')).resolves.toBeUndefined();

    expect(owns).toHaveBeenCalledWith('house', 'org-A', 'h1');
  });

  it.each(Object.entries(CODES))('answers 404 %s_NOT_FOUND-style (never 403) for a row of another organization', async (resource, code) => {
    owns.mockResolvedValue(false);

    const error: unknown = await service.assertOwned(resource as TenantResource, 'org-A', 'foreign').catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getStatus()).toBe(404);
    expect((error as NotFoundException).getResponse()).toMatchObject({ code });
  });

  it('checks a list of ids as a set in ONE statement and ignores duplicates', async () => {
    countOwned.mockResolvedValue(2);

    await service.assertAllOwned('house', 'org-A', ['h1', 'h2', 'h1']);

    expect(countOwned).toHaveBeenCalledTimes(1);
    expect(countOwned).toHaveBeenCalledWith('house', 'org-A', ['h1', 'h2']);
  });

  it('fails the whole request when even one id of the list is foreign or missing', async () => {
    countOwned.mockResolvedValue(1);

    await expect(service.assertAllOwned('house', 'org-A', ['h1', 'foreign'])).rejects.toBeInstanceOf(NotFoundException);
  });

  it('accepts an empty list without asking the database', async () => {
    await expect(service.assertAllOwned('house', 'org-A', [])).resolves.toBeUndefined();

    expect(countOwned).not.toHaveBeenCalled();
  });
});

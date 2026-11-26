/**
 * @file apps/api/src/shared/tenancy/tenant.guard.spec.ts
 * @shared TenantGuard: which ids it reads, and what it does with them
 */

import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { Test } from '@nestjs/testing';
import { TenancyService } from './tenancy.service';
import { TenantGuard } from './tenant.guard';
import { TenantScoped, type TenantRef } from './tenant-scope.decorator';

const ID_1 = 'a0000000-0000-4000-8000-000000000001';
const ID_2 = 'a0000000-0000-4000-8000-000000000002';

class FakeController {
  @TenantScoped({ resource: 'property', from: 'param', key: 'propertyId' })
  public byParam(): void {
    return;
  }

  @TenantScoped({ resource: 'property', from: 'query', key: 'propertyId', optional: true })
  public byOptionalQuery(): void {
    return;
  }

  @TenantScoped({ resource: 'house', from: 'body', key: 'houseIds' }, { resource: 'discount', from: 'param', key: 'discountId' })
  public byBodyAndParam(): void {
    return;
  }

  public unscoped(): void {
    return;
  }
}

describe('TenantGuard', () => {
  const assertOwned = jest.fn<Promise<void>, [string, string, string]>();
  const assertAllOwned = jest.fn<Promise<void>, [string, string, readonly string[]]>();
  let guard: TenantGuard;

  beforeEach(async () => {
    jest.resetAllMocks();
    assertOwned.mockResolvedValue(undefined);
    assertAllOwned.mockResolvedValue(undefined);
    const moduleRef = await Test.createTestingModule({
      providers: [TenantGuard, Reflector, { provide: TenancyService, useValue: { assertOwned, assertAllOwned } }],
    }).compile();
    guard = moduleRef.get(TenantGuard);
  });

  function context(handler: () => void, request: Record<string, unknown>): ExecutionContextHost {
    return new ExecutionContextHost([request], FakeController, handler);
  }

  const STAFF = { id: 's1', organizationId: 'org-A', fullName: 'A', email: 'a@example.com' };

  it('checks a route param against the signed-in staff member\'s organization', async () => {
    const request = { staff: STAFF, params: { propertyId: ID_1 }, query: {}, body: {} };

    await expect(guard.canActivate(context(FakeController.prototype.byParam, request))).resolves.toBe(true);

    expect(assertOwned).toHaveBeenCalledWith('property', 'org-A', ID_1);
  });

  it('lets the not-found error from the check through (404, before the handler runs)', async () => {
    assertOwned.mockRejectedValue(new NotFoundException());
    const request = { staff: STAFF, params: { propertyId: ID_1 }, query: {}, body: {} };

    await expect(guard.canActivate(context(FakeController.prototype.byParam, request))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('skips an optional query filter that is absent and checks it when present', async () => {
    const absent = { staff: STAFF, params: {}, query: {}, body: {} };
    await expect(guard.canActivate(context(FakeController.prototype.byOptionalQuery, absent))).resolves.toBe(true);
    expect(assertOwned).not.toHaveBeenCalled();
    expect(assertAllOwned).toHaveBeenCalledWith('property', 'org-A', []);

    const present = { staff: STAFF, params: {}, query: { propertyId: ID_2 }, body: {} };
    await guard.canActivate(context(FakeController.prototype.byOptionalQuery, present));
    expect(assertOwned).toHaveBeenCalledWith('property', 'org-A', ID_2);
  });

  it('checks a body list as a set and a param, for a route with two declared ids', async () => {
    const request = { staff: STAFF, params: { discountId: ID_1 }, query: {}, body: { houseIds: [ID_1, ID_2] } };

    await guard.canActivate(context(FakeController.prototype.byBodyAndParam, request));

    expect(assertAllOwned).toHaveBeenCalledWith('house', 'org-A', [ID_1, ID_2]);
    expect(assertOwned).toHaveBeenCalledWith('discount', 'org-A', ID_1);
  });

  it('leaves values that are not id-shaped to the validation layer (no row can have such an id)', async () => {
    const request = { staff: STAFF, params: { propertyId: 'not-an-id' }, query: {}, body: {} };

    await guard.canActivate(context(FakeController.prototype.byParam, request));

    expect(assertOwned).not.toHaveBeenCalled();
  });

  it('ignores junk in a body list (numbers, nested objects, null)', async () => {
    const request = { staff: STAFF, params: { discountId: ID_1 }, query: {}, body: { houseIds: [7, null, { id: ID_1 }, ID_2] } };

    await guard.canActivate(context(FakeController.prototype.byBodyAndParam, request));

    expect(assertOwned).toHaveBeenCalledWith('house', 'org-A', ID_2);
  });

  it('does nothing for a route that declares no ids', async () => {
    const request = { staff: STAFF, params: { propertyId: ID_1 }, query: {}, body: {} };

    await expect(guard.canActivate(context(FakeController.prototype.unscoped, request))).resolves.toBe(true);

    expect(assertOwned).not.toHaveBeenCalled();
  });

  it('refuses to run without a signed-in staff member (it must come after StaffGuard)', async () => {
    const request = { params: { propertyId: ID_1 }, query: {}, body: {} };

    await expect(guard.canActivate(context(FakeController.prototype.byParam, request))).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('exposes the declared refs as metadata', () => {
    const refs: TenantRef[] = Reflect.getMetadata('tenant:refs', FakeController.prototype.byBodyAndParam);

    expect(refs.map((ref) => `${ref.resource}:${ref.from}:${ref.key}`)).toEqual(['house:body:houseIds', 'discount:param:discountId']);
  });
});

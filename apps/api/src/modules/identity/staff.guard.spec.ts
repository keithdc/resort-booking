/**
 * @file apps/api/src/modules/identity/staff.guard.spec.ts
 * @feature identity
 */

import { UnauthorizedException } from '@nestjs/common';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { Test } from '@nestjs/testing';
import type { StaffProfile } from '@resort-booking/shared-types';
import { IdentityService } from './identity.service';
import { StaffGuard } from './staff.guard';

const STAFF: StaffProfile = { id: 's1', organizationId: 'o1', fullName: 'Owner', email: 'owner@example.com' };

describe('StaffGuard', () => {
  const staffFromToken = jest.fn<Promise<StaffProfile | null>, [string]>();
  let guard: StaffGuard;

  function contextWith(header: string | undefined): { context: ExecutionContextHost; request: { header: (name: string) => string | undefined; staff?: StaffProfile } } {
    const request: { header: (name: string) => string | undefined; staff?: StaffProfile } = {
      header: (name: string): string | undefined => (name === 'x-staff-token' ? header : undefined),
    };
    return { context: new ExecutionContextHost([request]), request };
  }

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [StaffGuard, { provide: IdentityService, useValue: { staffFromToken } }],
    }).compile();
    guard = moduleRef.get(StaffGuard);
  });

  it('lets a valid session token in and attaches the person to the request', async () => {
    staffFromToken.mockResolvedValue(STAFF);
    const { context, request } = contextWith('good-token');

    await expect(guard.canActivate(context)).resolves.toBe(true);

    expect(staffFromToken).toHaveBeenCalledWith('good-token');
    expect(request.staff).toEqual(STAFF);
  });

  it.each([undefined, ''])('refuses a missing token (%s) without asking the database', async (header) => {
    const { context } = contextWith(header);

    await expect(guard.canActivate(context)).rejects.toMatchObject({ response: { code: 'STAFF_UNAUTHORIZED' } });
    expect(staffFromToken).not.toHaveBeenCalled();
  });

  it('refuses an unknown or expired token with the same 401 body', async () => {
    staffFromToken.mockResolvedValue(null);
    const { context } = contextWith('stale');

    const error = await guard.canActivate(context).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(error).toMatchObject({ response: { message: 'Staff authentication required', code: 'STAFF_UNAUTHORIZED' } });
  });
});

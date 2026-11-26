/**
 * @file apps/api/src/shared/tenancy/current-staff.decorator.spec.ts
 * @shared CurrentStaff hands over the signed-in staff member, or fails loudly
 */

import { UnauthorizedException } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import type { StaffProfile } from '@resort-booking/shared-types';
import { CurrentStaff } from './current-staff.decorator';

class FakeController {
  public handler(@CurrentStaff() staff: StaffProfile): StaffProfile {
    return staff;
  }
}

interface ArgumentMeta {
  factory: (data: unknown, context: ExecutionContextHost) => StaffProfile;
}

function factory(): ArgumentMeta['factory'] {
  const args: Record<string, ArgumentMeta> = Reflect.getMetadata(ROUTE_ARGS_METADATA, FakeController, 'handler');
  const meta = Object.values(args)[0];
  if (meta === undefined) {
    throw new Error('CurrentStaff registered no argument');
  }
  return meta.factory;
}

describe('CurrentStaff', () => {
  const STAFF: StaffProfile = { id: 's1', organizationId: 'org-A', fullName: 'A', email: 'a@example.com' };

  it('returns the staff member the guard attached to the request', () => {
    const context = new ExecutionContextHost([{ staff: STAFF }]);

    expect(factory()(undefined, context)).toBe(STAFF);
  });

  it('answers 401 when the route forgot StaffGuard, so a handler never runs without an organization', () => {
    const context = new ExecutionContextHost([{}]);

    expect(() => factory()(undefined, context)).toThrow(UnauthorizedException);
  });
});

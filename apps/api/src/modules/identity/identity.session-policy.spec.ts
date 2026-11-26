/**
 * @file apps/api/src/modules/identity/identity.session-policy.spec.ts
 */

import { resolveSessionPolicy } from './identity.session-policy';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

function env(values: Record<string, string>): (name: string) => string | undefined {
  return (name: string): string | undefined => values[name];
}

describe('resolveSessionPolicy', () => {
  it('defaults to 30 minutes idle, 12 hours for employees and 8 for admins', () => {
    expect(resolveSessionPolicy(env({}))).toEqual({ idleMs: 30 * MINUTE, employeeMaxMs: 12 * HOUR, adminMaxMs: 8 * HOUR });
  });

  it('reads the three settings', () => {
    const policy = resolveSessionPolicy(
      env({ STAFF_SESSION_IDLE_MINUTES: '45', STAFF_SESSION_MAX_HOURS: '24', STAFF_ADMIN_SESSION_MAX_HOURS: '6' }),
    );
    expect(policy).toEqual({ idleMs: 45 * MINUTE, employeeMaxMs: 24 * HOUR, adminMaxMs: 6 * HOUR });
  });

  it('ignores junk, zero and out-of-range values instead of switching a limit off', () => {
    const policy = resolveSessionPolicy(
      env({ STAFF_SESSION_IDLE_MINUTES: '0', STAFF_SESSION_MAX_HOURS: 'forever', STAFF_ADMIN_SESSION_MAX_HOURS: '99999' }),
    );
    expect(policy).toEqual({ idleMs: 30 * MINUTE, employeeMaxMs: 12 * HOUR, adminMaxMs: 8 * HOUR });
    expect(resolveSessionPolicy(env({ STAFF_SESSION_IDLE_MINUTES: '-5' })).idleMs).toBe(30 * MINUTE);
    expect(resolveSessionPolicy(env({ STAFF_SESSION_IDLE_MINUTES: '3' })).idleMs).toBe(30 * MINUTE);
  });
});

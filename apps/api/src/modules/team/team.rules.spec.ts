/**
 * @file apps/api/src/modules/team/team.rules.spec.ts
 * @feature team
 */

import { inviteIsOpen, isRegistrationOpen, memberChangeAction, planMemberChange, type MemberState } from './team.rules';

const ADA: MemberState = { id: 'ada', role: 'admin', active: true };
const BOB: MemberState = { id: 'bob', role: 'admin', active: true };
const EVE: MemberState = { id: 'eve', role: 'employee', active: true };
const OFF: MemberState = { id: 'off', role: 'employee', active: false };

describe('planMemberChange', () => {
  it('lets an admin promote an employee', () => {
    expect(planMemberChange([ADA, EVE], 'ada', 'eve', { role: 'admin' })).toEqual({ ok: true, role: 'admin', active: true });
  });

  it('lets an admin switch an employee off and on again', () => {
    expect(planMemberChange([ADA, EVE], 'ada', 'eve', { active: false })).toEqual({ ok: true, role: 'employee', active: false });
    expect(planMemberChange([ADA, OFF], 'ada', 'off', { active: true })).toEqual({ ok: true, role: 'employee', active: true });
  });

  it('keeps the other field when only one is sent', () => {
    expect(planMemberChange([ADA, EVE], 'ada', 'eve', { role: 'admin' })).toMatchObject({ active: true });
    expect(planMemberChange([ADA, EVE], 'ada', 'eve', { active: false })).toMatchObject({ role: 'employee' });
  });

  it('refuses to demote the last admin (LAST_ADMIN)', () => {
    expect(planMemberChange([ADA, EVE], 'ada', 'ada', { role: 'employee' })).toEqual({ ok: false, code: 'LAST_ADMIN' });
  });

  it('refuses to switch off the last ACTIVE admin even when another admin exists but is switched off', () => {
    const switchedOffAdmin: MemberState = { id: 'old', role: 'admin', active: false };

    expect(planMemberChange([ADA, switchedOffAdmin, EVE], 'eve', 'ada', { active: false })).toEqual({ ok: false, code: 'LAST_ADMIN' });
  });

  it('lets one of two admins step down, since another admin remains', () => {
    expect(planMemberChange([ADA, BOB], 'ada', 'ada', { role: 'employee' })).toEqual({ ok: true, role: 'employee', active: true });
  });

  it('refuses when both change the same instant would leave no admin: each plan is checked against the current state', () => {
    // Two admins demote each other: the first is fine, the second (planned on the new state) is refused.
    const afterFirst: MemberState[] = [{ ...ADA, role: 'employee' }, BOB];

    expect(planMemberChange(afterFirst, 'bob', 'bob', { role: 'employee' })).toEqual({ ok: false, code: 'LAST_ADMIN' });
  });

  it('never lets anyone switch themselves off (CANNOT_DEACTIVATE_SELF), even with other admins around', () => {
    expect(planMemberChange([ADA, BOB], 'ada', 'ada', { active: false })).toEqual({ ok: false, code: 'CANNOT_DEACTIVATE_SELF' });
  });

  it('lets an admin switch another admin off when someone else stays', () => {
    expect(planMemberChange([ADA, BOB, EVE], 'ada', 'bob', { active: false })).toEqual({ ok: true, role: 'admin', active: false });
  });

  it('answers STAFF_NOT_FOUND for someone outside the list (another organization looks the same)', () => {
    expect(planMemberChange([ADA], 'ada', 'stranger', { role: 'admin' })).toEqual({ ok: false, code: 'STAFF_NOT_FOUND' });
  });

  it('refuses a change that changes nothing', () => {
    expect(planMemberChange([ADA, EVE], 'ada', 'eve', { role: 'employee' })).toEqual({ ok: false, code: 'NOTHING_TO_CHANGE' });
    expect(planMemberChange([ADA, EVE], 'ada', 'eve', {})).toEqual({ ok: false, code: 'NOTHING_TO_CHANGE' });
  });
});

describe('memberChangeAction', () => {
  it('names a switch off, a switch on and a role change', () => {
    expect(memberChangeAction(EVE, { role: 'employee', active: false })).toEqual(['team.deactivated']);
    expect(memberChangeAction(OFF, { role: 'employee', active: true })).toEqual(['team.reactivated']);
    expect(memberChangeAction(EVE, { role: 'admin', active: true })).toEqual(['team.role_changed']);
  });

  it('names both when one change does both', () => {
    expect(memberChangeAction(OFF, { role: 'admin', active: true })).toEqual(['team.reactivated', 'team.role_changed']);
  });
});

describe('inviteIsOpen', () => {
  const now = new Date('2026-11-26T12:00:00Z');
  const base = { acceptedAt: null, revokedAt: null, expiresAt: new Date('2026-11-27T12:00:00Z') };

  it('is open before the expiry', () => {
    expect(inviteIsOpen(base, now)).toBe(true);
  });

  it('is closed at and after the expiry (the boundary itself is closed)', () => {
    expect(inviteIsOpen({ ...base, expiresAt: now }, now)).toBe(false);
    expect(inviteIsOpen({ ...base, expiresAt: new Date('2026-11-25T12:00:00Z') }, now)).toBe(false);
  });

  it('is closed once used or revoked', () => {
    expect(inviteIsOpen({ ...base, acceptedAt: new Date('2026-11-26T10:00:00Z') }, now)).toBe(false);
    expect(inviteIsOpen({ ...base, revokedAt: new Date('2026-11-26T10:00:00Z') }, now)).toBe(false);
  });
});

describe('isRegistrationOpen', () => {
  it.each([
    ['true', true, true],
    ['TRUE', true, true],
    [' true ', true, true],
    ['false', false, false],
    ['false', true, false],
  ])('ALLOW_REGISTRATION=%j (production=%s) is %s', (value, production, expected) => {
    expect(isRegistrationOpen(value, production)).toBe(expected);
  });

  it('is open while developing and CLOSED in production when nothing is set', () => {
    expect(isRegistrationOpen(undefined, false)).toBe(true);
    expect(isRegistrationOpen(undefined, true)).toBe(false);
    expect(isRegistrationOpen('', true)).toBe(false);
  });

  it('is not opened by a vague value in production: only the word "true" opens it', () => {
    for (const vague of ['1', 'yes', 'on', 'open']) {
      expect(isRegistrationOpen(vague, true)).toBe(false);
    }
  });
});

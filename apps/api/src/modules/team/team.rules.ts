/**
 * @file apps/api/src/modules/team/team.rules.ts
 * @feature team
 * @dependencies staff-role
 * Pure rules for changing a team member. Nothing here touches the database.
 */

import type { StaffRole } from '../../shared/roles/staff-role';
import type { MemberChange } from './team.types';

export interface MemberState {
  id: string;
  role: StaffRole;
  active: boolean;
  /** The stored flag. Meaningless for an admin (always allowed); cleared whenever an account is an admin. */
  canManageRefunds: boolean;
}

export type MemberRefusal =
  | 'STAFF_NOT_FOUND'
  | 'LAST_ADMIN'
  | 'CANNOT_DEACTIVATE_SELF'
  | 'NOTHING_TO_CHANGE'
  | 'REFUND_ACCESS_NOT_FOR_ADMIN'
  | 'CANNOT_CHANGE_OWN_REFUND_ACCESS';

export type MemberChangeVerdict = { ok: true; role: StaffRole; active: boolean; canManageRefunds: boolean } | { ok: false; code: MemberRefusal };

/**
 * Can `actorId` apply `change` to `targetId`, given the organization's members?
 * - The target must belong to the organization (404, same as missing).
 * - The organization must keep at least one ACTIVE admin after the change (409 LAST_ADMIN).
 * - Nobody switches themselves off (409 CANNOT_DEACTIVATE_SELF): another admin does that.
 * - A change that changes nothing is refused so the audit log holds only real changes.
 * - The refund permission is for employees: asking for it on an admin (or while making someone an admin) is refused
 *   (400 REFUND_ACCESS_NOT_FOR_ADMIN), and nobody changes their own (400 CANNOT_CHANGE_OWN_REFUND_ACCESS), so
 *   nobody can grant themselves money access. Becoming an admin clears the stored flag, so a later demotion
 *   never brings an old grant back by itself.
 */
export function planMemberChange(
  members: readonly MemberState[],
  actorId: string,
  targetId: string,
  change: MemberChange,
): MemberChangeVerdict {
  const target = members.find((member): boolean => member.id === targetId);
  if (target === undefined) {
    return { ok: false, code: 'STAFF_NOT_FOUND' };
  }
  const role = change.role ?? target.role;
  const active = change.active ?? target.active;
  if (change.canManageRefunds !== undefined) {
    if (targetId === actorId) {
      return { ok: false, code: 'CANNOT_CHANGE_OWN_REFUND_ACCESS' };
    }
    if (role === 'admin') {
      return { ok: false, code: 'REFUND_ACCESS_NOT_FOR_ADMIN' };
    }
  }
  const canManageRefunds = role === 'admin' ? false : (change.canManageRefunds ?? target.canManageRefunds);
  if (role === target.role && active === target.active && canManageRefunds === target.canManageRefunds) {
    return { ok: false, code: 'NOTHING_TO_CHANGE' };
  }
  if (!active && targetId === actorId) {
    return { ok: false, code: 'CANNOT_DEACTIVATE_SELF' };
  }
  const adminsAfter = members.filter((member): boolean => {
    const memberRole = member.id === targetId ? role : member.role;
    const memberActive = member.id === targetId ? active : member.active;
    return memberRole === 'admin' && memberActive;
  }).length;
  if (adminsAfter < 1) {
    return { ok: false, code: 'LAST_ADMIN' };
  }
  return { ok: true, role, active, canManageRefunds };
}

/** The audit actions for a change: a switch on/off, a role change, and/or a grant or removal of refund access. */
export function memberChangeAction(before: MemberState, after: { role: StaffRole; active: boolean; canManageRefunds: boolean }): string[] {
  const actions: string[] = [];
  if (before.active && !after.active) {
    actions.push('team.deactivated');
  }
  if (!before.active && after.active) {
    actions.push('team.reactivated');
  }
  if (before.role !== after.role) {
    actions.push('team.role_changed');
  }
  if (after.role === 'employee' && before.canManageRefunds !== after.canManageRefunds) {
    actions.push(after.canManageRefunds ? 'team.refund_access_granted' : 'team.refund_access_removed');
  }
  return actions;
}

/** Is the invitation still usable? Not used, not revoked, not past its expiry. */
export function inviteIsOpen(invite: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date }, now: Date): boolean {
  return invite.acceptedAt === null && invite.revokedAt === null && invite.expiresAt.getTime() > now.getTime();
}

/**
 * Is registering a new workspace allowed? ALLOW_REGISTRATION=true/false decides; when it is unset the answer is
 * yes while developing and NO in production, so a deployment never ships with open sign-up by forgetting a flag.
 */
export function isRegistrationOpen(allowRegistration: string | undefined, production: boolean): boolean {
  const value = allowRegistration?.trim().toLowerCase();
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  return !production;
}

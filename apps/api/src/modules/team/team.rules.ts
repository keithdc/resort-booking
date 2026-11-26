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
}

export type MemberChangeVerdict =
  | { ok: true; role: StaffRole; active: boolean }
  | { ok: false; code: 'STAFF_NOT_FOUND' | 'LAST_ADMIN' | 'CANNOT_DEACTIVATE_SELF' | 'NOTHING_TO_CHANGE' };

/**
 * Can `actorId` apply `change` to `targetId`, given the organization's members?
 * - The target must belong to the organization (404, same as missing).
 * - The organization must keep at least one ACTIVE admin after the change (409 LAST_ADMIN).
 * - Nobody switches themselves off (409 CANNOT_DEACTIVATE_SELF): another admin does that.
 * - A change that changes nothing is refused so the audit log holds only real changes.
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
  if (role === target.role && active === target.active) {
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
  return { ok: true, role, active };
}

/** The audit action for a change: a switch on/off is named as such; otherwise it is a role change. */
export function memberChangeAction(before: MemberState, after: { role: StaffRole; active: boolean }): string[] {
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

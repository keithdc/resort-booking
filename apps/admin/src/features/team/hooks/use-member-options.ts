/**
 * @file apps/admin/src/features/team/hooks/use-member-options.ts
 * @feature team
 * @dependencies team-api
 */

'use client';

import type { TeamMember } from '@resort-booking/shared-types';
import { useEffect, useState } from 'react';
import { fetchTeam } from '../services/team-api';

/** One choice of the audit log's Member filter. */
export interface MemberOption {
  id: string;
  /** "Ada Admin", "Ada Admin (you)" or "Eve Employee (switched off)". */
  label: string;
}

/** The members of the workspace as filter choices: everyone on the Team page, switched-off people too, by name. */
export function memberOptions(members: readonly TeamMember[]): MemberOption[] {
  return [...members]
    .sort((a, b): number => a.fullName.localeCompare(b.fullName))
    .map((member): MemberOption => ({
      id: member.id,
      label: `${member.fullName}${member.isYou ? ' (you)' : ''}${member.active ? '' : ' (switched off)'}`,
    }));
}

/**
 * Loads the team once for the Member filter. When it cannot be read the list stays empty and only "Everyone" shows:
 * the log itself still works.
 */
export function useMemberOptions(): MemberOption[] {
  const [options, setOptions] = useState<MemberOption[]>([]);
  useEffect((): (() => void) => {
    let cancelled = false;
    fetchTeam()
      .then((overview): void => {
        if (!cancelled) {
          setOptions(memberOptions(overview.members));
        }
      })
      .catch((): void => undefined);
    return (): void => {
      cancelled = true;
    };
  }, []);
  return options;
}

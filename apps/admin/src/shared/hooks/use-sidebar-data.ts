/**
 * @file apps/admin/src/shared/hooks/use-sidebar-data.ts
 * @shared Who is signed in and how many refunds need a person (both optional extras for the sidebar)
 * @dependencies identity + refunds services
 */

'use client';

import type { StaffProfile } from '@resort-booking/shared-types';
import { useEffect, useState } from 'react';
import { fetchStaffMe } from '@/features/identity/services/staff-identity-api';
import { fetchStaffRefunds } from '@/features/refunds/services/staff-refunds-api';

interface SidebarData {
  profile: StaffProfile | null;
  refundsWaiting: number;
}

/**
 * Loads the profile and the refunds-waiting count once. Either failing leaves its part empty: the
 * navigation never depends on them.
 */
export function useSidebarData(enabled: boolean): SidebarData {
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [refundsWaiting, setRefundsWaiting] = useState(0);

  useEffect((): (() => void) => {
    let cancelled = false;
    if (enabled) {
      fetchStaffMe()
        .then((me): void => {
          if (!cancelled) {
            setProfile(me);
          }
        })
        .catch((): void => undefined);
      fetchStaffRefunds('needs_attention', '')
        .then((refunds): void => {
          if (!cancelled) {
            setRefundsWaiting(refunds.length);
          }
        })
        .catch((): void => undefined);
    }
    return (): void => {
      cancelled = true;
    };
  }, [enabled]);

  return { profile, refundsWaiting };
}

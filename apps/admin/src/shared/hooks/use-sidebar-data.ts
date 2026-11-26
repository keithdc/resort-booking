/**
 * @file apps/admin/src/shared/hooks/use-sidebar-data.ts
 * @shared Who is signed in (with role) and how many refunds need a person (both optional extras for the sidebar)
 * @dependencies staff-account + refunds services
 */

'use client';

import type { StaffAccount } from '@resort-booking/shared-types';
import { useEffect, useState } from 'react';
import { fetchStaffRefunds } from '@/features/refunds/services/staff-refunds-api';
import { fetchStaffAccount } from '@/shared/services/staff-account';

interface SidebarData {
  profile: StaffAccount | null;
  refundsWaiting: number;
}

/**
 * Loads the profile and the refunds-waiting count once. Either failing leaves its part empty: the
 * navigation never depends on them.
 */
export function useSidebarData(enabled: boolean): SidebarData {
  const [profile, setProfile] = useState<StaffAccount | null>(null);
  const [refundsWaiting, setRefundsWaiting] = useState(0);

  useEffect((): (() => void) => {
    let cancelled = false;
    if (enabled) {
      fetchStaffAccount()
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

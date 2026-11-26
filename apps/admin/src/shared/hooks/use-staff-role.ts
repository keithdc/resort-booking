/**
 * @file apps/admin/src/shared/hooks/use-staff-role.ts
 * @shared The signed-in person's role, so screens can hide actions the API would refuse
 * @dependencies staff-account
 */

'use client';

import type { StaffAccount, StaffRole } from '@resort-booking/shared-types';
import { useEffect, useState } from 'react';
import { fetchStaffAccount, hasRefundAccess, isAdminRole } from '@/shared/services/staff-account';

/**
 * The signed-in account (role and refund access), or null while it loads or when it cannot be read. Treat null as
 * "no access": hiding a button is comfort only, the API enforces role and permission on every route.
 */
export function useStaffAccount(): StaffAccount | null {
  const [account, setAccount] = useState<StaffAccount | null>(null);

  useEffect((): (() => void) => {
    let cancelled = false;
    fetchStaffAccount()
      .then((me): void => {
        if (!cancelled) {
          setAccount(me);
        }
      })
      .catch((): void => undefined);
    return (): void => {
      cancelled = true;
    };
  }, []);

  return account;
}

/** The role of the signed-in person, or null while it loads or when it cannot be read. */
export function useStaffRole(): StaffRole | null {
  return useStaffAccount()?.role ?? null;
}

/** True once the signed-in person is known to be an admin (false while loading and for employees). */
export function useIsAdmin(): boolean {
  return isAdminRole(useStaffRole());
}

/**
 * True once the signed-in person is known to be an admin, or an employee with "can handle refunds and money actions"
 * (false while loading, on error, and for an employee without it). Drives the refund and money screens.
 */
export function useCanManageRefunds(): boolean {
  return hasRefundAccess(useStaffAccount());
}

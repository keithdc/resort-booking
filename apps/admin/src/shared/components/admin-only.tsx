/**
 * @file apps/admin/src/shared/components/admin-only.tsx
 * @shared Server guard for admin-only routes: employees get a "not allowed" page, never a crash
 * @dependencies staff-account, not-allowed
 */

import type { ReactNode } from 'react';
import { ApiRequestError } from '@/shared/services/api-client';
import { fetchStaffAccount, isAdminRole } from '@/shared/services/staff-account';
import { NotAllowed } from './not-allowed';

interface AdminOnlyProps {
  /** Name of the page for the notice, e.g. "The team page". */
  what: string;
  children: ReactNode;
}

/**
 * Server component. Renders the children for admins and the notice for employees (or on a 403). A 401 is handled
 * by the api client (redirect to login); other failures bubble to the route's error boundary.
 */
export async function AdminOnly({ what, children }: AdminOnlyProps): Promise<React.JSX.Element> {
  try {
    const account = await fetchStaffAccount();
    return isAdminRole(account.role) ? <>{children}</> : <NotAllowed what={what} />;
  } catch (error: unknown) {
    if (error instanceof ApiRequestError && error.status === 403) {
      return <NotAllowed what={what} />;
    }
    throw error;
  }
}

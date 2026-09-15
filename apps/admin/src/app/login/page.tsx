/**
 * @file apps/admin/src/app/login/page.tsx
 * @feature identity
 * @dependencies StaffLoginPage
 */

import { Suspense } from 'react';
import { StaffLoginPage } from '@/features/identity/components/staff-login-page';

export const dynamic = 'force-dynamic';

/**
 * Staff login route (no sidebar).
 */
export default function LoginRoute(): React.JSX.Element {
  return (
    <Suspense>
      <StaffLoginPage />
    </Suspense>
  );
}

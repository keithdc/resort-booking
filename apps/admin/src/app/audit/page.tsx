/**
 * @file apps/admin/src/app/audit/page.tsx
 * @feature team
 * @dependencies AuditPage, AdminOnly
 */

import { AuditPage } from '@/features/team';
import { AdminOnly } from '@/shared/components/admin-only';

export const dynamic = 'force-dynamic';

/**
 * Audit log route (admins only: employees see a notice).
 */
export default function AuditRoute(): React.JSX.Element {
  return (
    <AdminOnly what="The audit log">
      <AuditPage />
    </AdminOnly>
  );
}

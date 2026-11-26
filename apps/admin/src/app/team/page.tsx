/**
 * @file apps/admin/src/app/team/page.tsx
 * @feature team
 * @dependencies TeamPage, AdminOnly
 */

import { TeamPage } from '@/features/team';
import { AdminOnly } from '@/shared/components/admin-only';

export const dynamic = 'force-dynamic';

/**
 * Team route (admins only: employees see a notice).
 */
export default function TeamRoute(): React.JSX.Element {
  return (
    <AdminOnly what="The team page">
      <TeamPage />
    </AdminOnly>
  );
}

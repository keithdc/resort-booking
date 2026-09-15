/**
 * @file apps/admin/src/app/reports/page.tsx
 * @feature reporting
 * @dependencies ReportsPage
 */

import { ReportsPage } from '@/features/reporting';

export const dynamic = 'force-dynamic';

/**
 * Reports route.
 */
export default async function ReportsRoute(): Promise<React.JSX.Element> {
  return <ReportsPage />;
}

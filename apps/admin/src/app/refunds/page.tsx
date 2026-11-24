/**
 * @file apps/admin/src/app/refunds/page.tsx
 * @feature refunds
 * @dependencies RefundsPage
 */

import { RefundsPage } from '@/features/refunds';

export const dynamic = 'force-dynamic';

/**
 * Refunds route.
 */
export default function RefundsRoute(): React.JSX.Element {
  return <RefundsPage />;
}

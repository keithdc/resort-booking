/**
 * @file apps/admin/src/app/page.tsx
 * @feature reservations
 * @dependencies OccupancyHomePage
 */

import { OccupancyHomePage } from '@/features/reservations';

export const dynamic = 'force-dynamic';

/**
 * Admin home calendar.
 */
export default async function Home(): Promise<React.JSX.Element> {
  return <OccupancyHomePage />;
}

/**
 * @file apps/admin/src/app/page.tsx
 * @feature property
 * @dependencies StaffHomePage
 */

import { StaffHomePage } from '@/features/property';

export const dynamic = 'force-dynamic';

/**
 * Admin home.
 */
export default async function Home(): Promise<React.JSX.Element> {
  return <StaffHomePage />;
}

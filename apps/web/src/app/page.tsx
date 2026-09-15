/**
 * @file apps/web/src/app/page.tsx
 * @feature property
 * @dependencies PropertyHomePage
 */

import { PropertyHomePage } from '@/features/property';

export const dynamic = 'force-dynamic';

/**
 * Guest home route.
 */
export default async function Home(): Promise<React.JSX.Element> {
  return <PropertyHomePage />;
}

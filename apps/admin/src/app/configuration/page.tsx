/**
 * @file apps/admin/src/app/configuration/page.tsx
 * @feature configuration
 * @dependencies ConfigurationPage
 */

import { ConfigurationPage } from '@/features/configuration';

export const dynamic = 'force-dynamic';

/**
 * Configuration route.
 */
export default async function ConfigurationRoute(): Promise<React.JSX.Element> {
  return <ConfigurationPage />;
}

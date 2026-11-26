/**
 * @file apps/admin/src/app/register/page.tsx
 * @feature registration
 * @dependencies RegisterPage
 */

import { RegisterPage } from '@/features/registration';

export const dynamic = 'force-dynamic';

/**
 * Create-an-account route (public, no sidebar).
 */
export default function RegisterRoute(): React.JSX.Element {
  return <RegisterPage />;
}

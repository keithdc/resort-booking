/**
 * @file apps/admin/src/app/invite/page.tsx
 * @feature registration
 * @dependencies InvitePage
 */

import { InvitePage } from '@/features/registration';

export const dynamic = 'force-dynamic';

/**
 * Invitation link route (public, no sidebar): `/invite#token=...`. The token is after the `#`, so this server never sees it;
 * the page reads it in the browser and removes it from the address bar.
 */
export default function InviteRoute(): React.JSX.Element {
  return <InvitePage />;
}

/**
 * @file apps/admin/src/app/invite/[token]/page.tsx
 * @feature registration
 * @dependencies InvitePage
 */

import { InvitePage } from '@/features/registration';

export const dynamic = 'force-dynamic';

interface InviteRouteProps {
  params: Promise<{ token: string }>;
}

/**
 * Invitation link route (public, no sidebar). The token comes from the address; the API validates it.
 */
export default async function InviteRoute({ params }: InviteRouteProps): Promise<React.JSX.Element> {
  const { token } = await params;
  return <InvitePage token={token} />;
}

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
 * DEPRECATED older link shape `/invite/<token>`, kept for one release so links already handed out still open (they are
 * single-use and expire). New links are `/invite#token=...` (app/invite/page.tsx). Remove this route with the API's
 * deprecated GET preview (docs/17). The page removes the token from the address bar as soon as it loads.
 */
export default async function InviteRoute({ params }: InviteRouteProps): Promise<React.JSX.Element> {
  const { token } = await params;
  return <InvitePage legacyToken={token} />;
}

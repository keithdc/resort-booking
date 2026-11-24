/**
 * @file apps/web/src/app/manage/page.tsx
 * @feature bookings
 * @dependencies ManageBookingPage
 */

import { ManageBookingPage } from '@/features/bookings';

export const dynamic = 'force-dynamic';

interface ManagePageProps {
  searchParams: Promise<{ reference?: string }>;
}

/**
 * Manage-booking route. Only the reference may arrive in the address; the email is never put in a URL.
 */
export default async function ManageRoute({ searchParams }: ManagePageProps): Promise<React.JSX.Element> {
  const { reference } = await searchParams;
  return <ManageBookingPage initialReference={reference ?? ''} />;
}

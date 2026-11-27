/**
 * @file apps/web/src/app/manage/page.tsx
 * @feature bookings
 * @dependencies ManageBookingPage
 */

import type { Metadata } from 'next';
import { ManageBookingPage } from '@/features/bookings';
import { manageMetadata } from '@/shared/seo/metadata';

export const dynamic = 'force-dynamic';

interface ManagePageProps {
  searchParams: Promise<{ reference?: string }>;
}

/** The booking look-up is private: never indexed, links not followed. */
export function generateMetadata(): Metadata {
  return manageMetadata();
}

/**
 * Manage-booking route. Only the reference may arrive in the address; the email is never put in a URL.
 */
export default async function ManageRoute({ searchParams }: ManagePageProps): Promise<React.JSX.Element> {
  const { reference } = await searchParams;
  return <ManageBookingPage initialReference={reference ?? ''} />;
}

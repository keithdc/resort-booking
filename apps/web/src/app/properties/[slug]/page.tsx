/**
 * @file apps/web/src/app/properties/[slug]/page.tsx
 * @feature property
 * @dependencies PropertyDetailPage
 */

import { PropertyDetailPage } from '@/features/property';

export const dynamic = 'force-dynamic';

interface PropertyPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Property route.
 */
export default async function PropertyRoute({ params }: PropertyPageProps): Promise<React.JSX.Element> {
  const { slug } = await params;
  return <PropertyDetailPage slug={slug} />;
}

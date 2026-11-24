/**
 * @file apps/web/src/features/houses/components/stay-cancellation-policy.tsx
 * @feature houses
 * @dependencies stay-quote-context, cancellation-policy section
 */

'use client';

import type { CancellationPolicy } from '@resort-booking/shared-types';
import { CancellationPolicySection } from '@/shared/components/cancellation-policy';
import { useStayQuote } from '../context/stay-quote-context';

interface StayCancellationPolicyProps {
  policy: CancellationPolicy | null;
  currencyCode: string;
}

/**
 * The cancellation section for a stay page. When the checkout is showing a quote, its check-in
 * date turns the refund steps into real deadlines; otherwise the generic ladder is shown.
 */
export function StayCancellationPolicy({ policy, currencyCode }: StayCancellationPolicyProps): React.JSX.Element {
  const quote = useStayQuote();
  return <CancellationPolicySection policy={policy} currencyCode={currencyCode} checkIn={quote?.checkIn} />;
}

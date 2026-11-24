/**
 * @file apps/web/src/shared/services/payments-api.ts
 * @shared Payment requests used by checkout and by changing booking dates
 * @dependencies api-client
 */

import type { MockPaymentOutcome, MockPaymentResult, PaymentSummary } from '@resort-booking/shared-types';
import { getApiOk } from './api-client';

/**
 * Starts (or reopens) the payment for a card hold. The amount is the price the guest was quoted.
 */
export function startPayment(holdId: string): Promise<PaymentSummary> {
  return getApiOk<PaymentSummary>(`/holds/${encodeURIComponent(holdId)}/payment`, { method: 'POST' });
}

/**
 * Test mode only: settles the payment as a provider would. The API answers 404 when a real
 * provider is active, so this can never confirm a stay in production.
 */
export function completeMockPayment(paymentId: string, outcome: MockPaymentOutcome): Promise<MockPaymentResult> {
  return getApiOk<MockPaymentResult>(`/payments/${encodeURIComponent(paymentId)}/mock/complete`, {
    method: 'POST',
    body: JSON.stringify({ outcome }),
  });
}

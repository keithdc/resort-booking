/**
 * @file apps/web/src/features/houses/hooks/use-mock-payment.ts
 * @feature houses
 * @dependencies payments-api
 */

'use client';

import type { PaymentSummary, ReservationConfirmation } from '@resort-booking/shared-types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiRequestError } from '@/shared/services/api-client';
import { completeMockPayment, startPayment } from '@/shared/services/payments-api';

export type PaymentPhase = 'starting' | 'ready' | 'paying' | 'confirmed' | 'declined' | 'error';

export interface MockPaymentState {
  phase: PaymentPhase;
  payment: PaymentSummary | null;
  confirmation: ReservationConfirmation | null;
  error: string | null;
  /** Settles the payment as a success. */
  pay: () => Promise<void>;
  /** Settles the payment as a declined card. */
  decline: () => Promise<void>;
}

/**
 * Drives the test-mode payment for one hold: opens the payment, then settles it as paid or declined.
 * The API owns every outcome; this only reports what it returned.
 */
export function useMockPayment(holdId: string): MockPaymentState {
  const [phase, setPhase] = useState<PaymentPhase>('starting');
  const [payment, setPayment] = useState<PaymentSummary | null>(null);
  const [confirmation, setConfirmation] = useState<ReservationConfirmation | null>(null);
  const [error, setError] = useState<string | null>(null);
  // A second tap while a request is in flight must not start a second settle.
  const busy = useRef(false);

  useEffect((): (() => void) => {
    let cancelled = false;
    setPhase('starting');
    setError(null);
    startPayment(holdId)
      .then((summary): void => {
        if (!cancelled) {
          setPayment(summary);
          setPhase('ready');
        }
      })
      .catch((failure: unknown): void => {
        if (!cancelled) {
          setError(failure instanceof ApiRequestError ? failure.message : 'Could not start the payment');
          setPhase('error');
        }
      });
    return (): void => {
      cancelled = true;
    };
  }, [holdId]);

  const settle = useCallback(
    async (outcome: 'success' | 'failure'): Promise<void> => {
      if (payment === null || busy.current) {
        return;
      }
      busy.current = true;
      setPhase('paying');
      setError(null);
      try {
        const result = await completeMockPayment(payment.id, outcome);
        setPayment(result.payment);
        if (result.confirmation !== null) {
          setConfirmation(result.confirmation);
          setPhase('confirmed');
        } else {
          setPhase('declined');
        }
      } catch (failure: unknown) {
        setError(failure instanceof ApiRequestError ? failure.message : 'The payment could not be completed');
        setPhase('error');
      } finally {
        busy.current = false;
      }
    },
    [payment],
  );

  const pay = useCallback((): Promise<void> => settle('success'), [settle]);
  const decline = useCallback((): Promise<void> => settle('failure'), [settle]);

  return { phase, payment, confirmation, error, pay, decline };
}

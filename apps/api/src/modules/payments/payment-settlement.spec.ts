/**
 * @file apps/api/src/modules/payments/payment-settlement.spec.ts
 * @feature payments
 */

import { PaymentSettlementRegistry, type PaymentSettlementHandler } from './payment-settlement';

function handler(purpose: 'booking' | 'rebook'): PaymentSettlementHandler {
  return { purpose, settle: (): Promise<void> => Promise.resolve(), presentSettled: (): Promise<null> => Promise.resolve(null) };
}

describe('PaymentSettlementRegistry', () => {
  it('finds the handler registered for a purpose', () => {
    const registry = new PaymentSettlementRegistry();
    const rebook = handler('rebook');

    registry.register(rebook);

    expect(registry.find('rebook')).toBe(rebook);
  });

  it('finds nothing for a purpose nobody registered', () => {
    expect(new PaymentSettlementRegistry().find('rebook')).toBeNull();
  });

  it('keeps purposes apart', () => {
    const registry = new PaymentSettlementRegistry();
    registry.register(handler('rebook'));

    expect(registry.find('booking')).toBeNull();
  });

  it('refuses a second handler for the same purpose, which would be a programming mistake', () => {
    const registry = new PaymentSettlementRegistry();
    registry.register(handler('rebook'));

    expect(() => registry.register(handler('rebook'))).toThrow('already registered');
  });
});

/**
 * @file apps/api/src/modules/payments/mock-payment.dto.spec.ts
 * @feature payments
 */

import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { MockPaymentDto } from './dto/mock-payment.dto';

async function problems(payload: object): Promise<number> {
  return (await validate(plainToInstance(MockPaymentDto, payload))).length;
}

describe('MockPaymentDto', () => {
  it.each(['success', 'failure'])('accepts the outcome %s', async (outcome) => {
    expect(await problems({ outcome })).toBe(0);
  });

  it.each([{}, { outcome: 'paid' }, { outcome: '' }, { outcome: 1 }, { outcome: null }])('rejects %j', async (payload) => {
    expect(await problems(payload)).toBeGreaterThan(0);
  });
});

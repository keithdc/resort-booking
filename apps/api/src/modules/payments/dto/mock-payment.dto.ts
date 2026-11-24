/**
 * @file apps/api/src/modules/payments/dto/mock-payment.dto.ts
 * @feature payments
 * @dependencies class-validator
 */

import type { MockPaymentOutcome, MockPaymentRequest } from '@resort-booking/shared-types';
import { IsIn } from 'class-validator';

export class MockPaymentDto implements MockPaymentRequest {
  @IsIn(['success', 'failure'])
  public outcome!: MockPaymentOutcome;
}

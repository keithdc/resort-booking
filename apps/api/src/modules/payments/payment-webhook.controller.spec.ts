/**
 * @file apps/api/src/modules/payments/payment-webhook.controller.spec.ts
 * @feature payments
 */

import 'reflect-metadata';
import { HTTP_CODE_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { PaymentWebhookController } from './payment-webhook.controller';
import { PaymentWebhookService } from './payment-webhook.service';

describe('PaymentWebhookController', () => {
  const handle = jest.fn();
  let controller: PaymentWebhookController;

  beforeEach(async () => {
    jest.resetAllMocks();
    handle.mockResolvedValue({ received: true });
    const moduleRef = await Test.createTestingModule({
      controllers: [PaymentWebhookController],
      providers: [{ provide: PaymentWebhookService, useValue: { handle } }],
    }).compile();
    controller = moduleRef.get(PaymentWebhookController);
  });

  it('is POST /payments/webhooks/:provider and answers 200', () => {
    const handler = PaymentWebhookController.prototype.receive;

    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('payments/webhooks/:provider');
    expect(Reflect.getMetadata(HTTP_CODE_METADATA, handler)).toBe(200);
  });

  it('hands the exact raw bytes, the headers and the caller IP to the service', async () => {
    const rawBody = Buffer.from('{"id":"evt_1"}');
    const request: RawBodyRequest<Request> = Object.assign(Object.create(null) as RawBodyRequest<Request>, {
      rawBody,
      headers: { 'stripe-signature': 't=1,v1=ab' },
      ip: '203.0.113.9',
    });

    const answer = await controller.receive('mock', request);

    expect(handle).toHaveBeenCalledWith('mock', { rawBody, headers: { 'stripe-signature': 't=1,v1=ab' }, ip: '203.0.113.9' });
    expect(answer).toEqual({ status: 'ok', data: { received: true } });
  });

  it('has no staff or guest guard: the provider\'s signature is the authentication', () => {
    expect(Reflect.getMetadata('__guards__', PaymentWebhookController.prototype.receive)).toBeUndefined();
    expect(Reflect.getMetadata('__guards__', PaymentWebhookController)).toBeUndefined();
  });
});

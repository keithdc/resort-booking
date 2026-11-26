/**
 * @file apps/api/src/shared/http/webhook-raw-body.spec.ts
 * @shared Raw bytes only for the webhook route, and a strict size limit
 */

import {
  dropRawBodyOutsideWebhooks,
  WEBHOOK_MAX_BODY_BYTES,
  webhookSizeGuard,
  type WebhookRequestLike,
} from './webhook-raw-body';

function request(overrides: Partial<WebhookRequestLike> = {}): WebhookRequestLike {
  return { method: 'POST', originalUrl: '/payments/webhooks/mock', headers: {}, ...overrides };
}

function responder(): { response: { status: jest.Mock }; json: jest.Mock } {
  const json = jest.fn();
  return { response: { status: jest.fn().mockReturnValue({ json }) }, json };
}

describe('webhookSizeGuard', () => {
  it('refuses a webhook that announces more than the limit, before it is read', () => {
    const { response, json } = responder();
    const next = jest.fn();

    webhookSizeGuard(request({ headers: { 'content-length': String(WEBHOOK_MAX_BODY_BYTES + 1) } }), response, next);

    expect(response.status).toHaveBeenCalledWith(413);
    expect(json).toHaveBeenCalledWith({ status: 'error', message: 'Payload too large', code: 'PAYLOAD_TOO_LARGE' });
    expect(next).not.toHaveBeenCalled();
  });

  it('lets a body at the limit, a body with no announced length and a query string through', () => {
    for (const req of [
      request({ headers: { 'content-length': String(WEBHOOK_MAX_BODY_BYTES) } }),
      request({ headers: {} }),
      request({ originalUrl: '/payments/webhooks/mock?x=1', headers: { 'content-length': '10' } }),
    ]) {
      const next = jest.fn();
      webhookSizeGuard(req, responder().response, next);
      expect(next).toHaveBeenCalledTimes(1);
    }
  });

  it('leaves every other route to the ordinary 100 kB limit', () => {
    const next = jest.fn();

    webhookSizeGuard(request({ originalUrl: '/holds', headers: { 'content-length': '90000' } }), responder().response, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('dropRawBodyOutsideWebhooks', () => {
  it('keeps the raw bytes on the webhook route', () => {
    const req = request({ rawBody: Buffer.from('{}') });
    const next = jest.fn();

    dropRawBodyOutsideWebhooks(req, undefined, next);

    expect(req.rawBody).toEqual(Buffer.from('{}'));
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('removes them everywhere else, including other payment routes and other methods', () => {
    for (const req of [
      request({ originalUrl: '/holds', rawBody: Buffer.from('{}') }),
      request({ originalUrl: '/payments/abc/mock/complete', rawBody: Buffer.from('{}') }),
      request({ method: 'GET', rawBody: Buffer.from('{}') }),
      request({ originalUrl: '/staff/login', rawBody: Buffer.from('{"password":"x"}') }),
    ]) {
      dropRawBodyOutsideWebhooks(req, undefined, jest.fn());
      expect(req.rawBody).toBeUndefined();
    }
  });
});

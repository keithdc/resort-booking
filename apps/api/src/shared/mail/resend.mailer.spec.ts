/**
 * @file apps/api/src/shared/mail/resend.mailer.spec.ts
 * @shared Resend client with a mocked fetch: the real API is never called
 */

import { Logger } from '@nestjs/common';
import { RESEND_ENDPOINT, ResendMailer } from './resend.mailer';

const KEY = 're_test_key_do_not_leak_123';
const MESSAGE = { to: 'lena@example.com', subject: 'Subject S', html: '<p>Body B https://admin.example.com/invite/SECRETTOKEN</p>', text: 'Text T SECRETTOKEN', requestId: 'req-123456' };

describe('ResendMailer', () => {
  const fetchFn = jest.fn<Promise<Response>, [string, RequestInit]>();
  const logged: string[] = [];
  const mailer = (timeoutMs?: number): ResendMailer =>
    new ResendMailer({ apiKey: KEY, from: 'Humphreys <staff@example.com>', fetchFn: (input, init): Promise<Response> => fetchFn(String(input), init ?? {}), ...(timeoutMs === undefined ? {} : { timeoutMs }) });

  beforeEach(() => {
    jest.resetAllMocks();
    logged.length = 0;
    for (const level of ['log', 'warn', 'error'] as const) {
      jest.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]): void => {
        logged.push(String(args[0]));
      });
    }
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('posts one JSON request with Bearer auth, the sender, one recipient and both bodies', async () => {
    fetchFn.mockResolvedValue(Response.json({ id: 'msg-1' }, { status: 200 }));

    await mailer().send(MESSAGE);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0] ?? ['', {}];
    expect(url).toBe(RESEND_ENDPOINT);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' });
    expect(JSON.parse(String(init.body))).toEqual({
      from: 'Humphreys <staff@example.com>',
      to: ['lena@example.com'],
      subject: 'Subject S',
      html: MESSAGE.html,
      text: MESSAGE.text,
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('answers sent with the provider id on 2xx', async () => {
    fetchFn.mockResolvedValue(Response.json({ id: 'msg-1' }));

    await expect(mailer().send(MESSAGE)).resolves.toEqual({ status: 'sent', providerId: 'msg-1' });
  });

  it('answers sent even when the success body is unreadable', async () => {
    fetchFn.mockResolvedValue(new Response('not json', { status: 200 }));

    await expect(mailer().send(MESSAGE)).resolves.toEqual({ status: 'sent', providerId: null });
  });

  it('answers failed with an error class on a non-2xx, and does not retry', async () => {
    fetchFn.mockResolvedValue(Response.json({ name: 'validation_error', message: 'bad lena@example.com' }, { status: 422 }));

    await expect(mailer().send(MESSAGE)).resolves.toEqual({ status: 'failed', errorClass: 'http_422_validation_error' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('keeps just the status when the error body is not usable', async () => {
    fetchFn.mockResolvedValue(new Response('<html>', { status: 502 }));
    await expect(mailer().send(MESSAGE)).resolves.toEqual({ status: 'failed', errorClass: 'http_502' });

    fetchFn.mockResolvedValue(Response.json({ name: 'Weird Name; drop' }, { status: 401 }));
    await expect(mailer().send(MESSAGE)).resolves.toEqual({ status: 'failed', errorClass: 'http_401' });
  });

  it('answers failed "network" when fetch rejects', async () => {
    fetchFn.mockRejectedValue(new TypeError('fetch failed'));

    await expect(mailer().send(MESSAGE)).resolves.toEqual({ status: 'failed', errorClass: 'network' });
  });

  it('answers failed "timeout" when the request is aborted by the timeout', async () => {
    fetchFn.mockRejectedValue(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));

    await expect(mailer().send(MESSAGE)).resolves.toEqual({ status: 'failed', errorClass: 'timeout' });
  });

  it('really aborts a request that hangs past the timeout', async () => {
    fetchFn.mockImplementation(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );

    await expect(mailer(20).send(MESSAGE)).resolves.toEqual({ status: 'failed', errorClass: 'timeout' });
  });

  it('never throws, whatever fetch does', async () => {
    fetchFn.mockImplementation(() => {
      throw new Error('sync boom');
    });

    await expect(mailer().send(MESSAGE)).resolves.toEqual({ status: 'failed', errorClass: 'network' });
  });

  it('never logs the key, the address, the subject or the body/link, only outcome, class and request id', async () => {
    fetchFn.mockResolvedValueOnce(Response.json({ id: 'msg-1' }));
    fetchFn.mockResolvedValueOnce(Response.json({ name: 'validation_error', message: 'lena@example.com' }, { status: 422 }));
    fetchFn.mockRejectedValueOnce(new Error(`connect failed with ${KEY}`));

    const results = [await mailer().send(MESSAGE), await mailer().send(MESSAGE), await mailer().send(MESSAGE)];

    const output = `${logged.join('\n')}\n${JSON.stringify(results)}`;
    for (const secret of [KEY, 'lena@example.com', 'Subject S', 'SECRETTOKEN', 'Body B']) {
      expect(output).not.toContain(secret);
    }
    expect(logged.join('\n')).toContain('req=req-123456');
    expect(logged.join('\n')).toContain('class=http_422_validation_error');
  });

  it('reports itself enabled', () => {
    expect(mailer().enabled).toBe(true);
  });
});

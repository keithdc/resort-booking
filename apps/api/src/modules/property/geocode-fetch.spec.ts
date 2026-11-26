/**
 * @file apps/api/src/modules/property/geocode-fetch.spec.ts
 * @feature property
 */

import { fetchBoundedJson, GEOCODE_MAX_BYTES, type Fetcher } from './geocode-fetch';

const URL_UNDER_TEST = new URL('https://photon.example/api/?q=x');

function answer(body: string, init: { status?: number } = {}): Response {
  return new Response(body, { status: init.status ?? 200 });
}

describe('fetchBoundedJson', () => {
  it('parses a normal answer and sends the headers and a timeout signal', async () => {
    const fetcher = jest.fn<ReturnType<Fetcher>, Parameters<Fetcher>>().mockResolvedValue(answer('{"features":[]}'));

    await expect(fetchBoundedJson(URL_UNDER_TEST, { 'User-Agent': 'test' }, fetcher)).resolves.toEqual({ features: [] });

    const init = fetcher.mock.calls[0]?.[1];
    expect(init?.headers).toEqual({ 'User-Agent': 'test' });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('gives up on an upstream that does not answer within the timeout', async () => {
    const fetcher = jest.fn<ReturnType<Fetcher>, Parameters<Fetcher>>((_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      }),
    );

    await expect(fetchBoundedJson(URL_UNDER_TEST, {}, fetcher, 20)).resolves.toBeNull();
  });

  it('drops an answer larger than the cap without parsing it', async () => {
    const huge = answer(`{"pad":"${'a'.repeat(GEOCODE_MAX_BYTES)}"}`);

    await expect(fetchBoundedJson(URL_UNDER_TEST, {}, () => Promise.resolve(huge))).resolves.toBeNull();
  });

  it('accepts an answer exactly at the cap', async () => {
    const padding = 'a'.repeat(GEOCODE_MAX_BYTES - '{"pad":""}'.length);

    await expect(fetchBoundedJson(URL_UNDER_TEST, {}, () => Promise.resolve(answer(`{"pad":"${padding}"}`)))).resolves.toMatchObject({ pad: padding });
  });

  it.each([
    ['a non-200 answer', answer('{}', { status: 503 })],
    ['a body that is not JSON', answer('<html>')],
    ['an empty body', answer('')],
  ])('answers null for %s', async (_name, response) => {
    await expect(fetchBoundedJson(URL_UNDER_TEST, {}, () => Promise.resolve(response))).resolves.toBeNull();
  });

  it('answers null when the network fails', async () => {
    await expect(fetchBoundedJson(URL_UNDER_TEST, {}, () => Promise.reject(new Error('ECONNRESET')))).resolves.toBeNull();
  });
});

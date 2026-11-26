/**
 * @file apps/api/src/modules/identity/identity.device-label.spec.ts
 */

import { UNKNOWN_DEVICE, deviceLabelFromUserAgent } from './identity.device-label';

describe('deviceLabelFromUserAgent', () => {
  it.each([
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', 'Chrome on macOS'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', 'Safari on iPhone'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0', 'Edge on Windows'],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0', 'Firefox on Linux'],
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36', 'Chrome on Android'],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/126.0.0.0 Safari/537.36', 'Chrome on macOS'],
    ['Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1', 'Chrome on iPad'],
  ])('labels %s as %s', (agent: string, expected: string) => {
    expect(deviceLabelFromUserAgent(agent)).toBe(expected);
  });

  it('falls back to what it knows, then to "Unknown device"', () => {
    expect(deviceLabelFromUserAgent('curl/8.4.0')).toBe(UNKNOWN_DEVICE);
    expect(deviceLabelFromUserAgent('Mozilla/5.0 (Windows NT 10.0)')).toBe('Windows');
    expect(deviceLabelFromUserAgent(undefined)).toBe(UNKNOWN_DEVICE);
    expect(deviceLabelFromUserAgent('   ')).toBe(UNKNOWN_DEVICE);
  });

  it('never returns more than the label, whatever the header holds', () => {
    const label = deviceLabelFromUserAgent(`Chrome/1 ${'x'.repeat(5000)} <script>`);
    expect(label).toBe('Chrome');
  });
});

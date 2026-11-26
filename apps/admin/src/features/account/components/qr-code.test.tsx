// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/account/components/qr-code.test.tsx
 * @feature account
 */

import { cleanup, render, screen } from '@testing-library/react';
import jsQR from 'jsqr';
import { afterEach, describe, expect, it } from 'vitest';
import { QR_QUIET_ZONE, QrCode, buildQrShape } from './qr-code';

const URI = 'otpauth://totp/Humphreys:ada%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Humphreys';
const SCALE = 6;

/** Rasterises the rendered SVG path (runs of `M x y h w v1 h-w z`) into an RGBA buffer, like a camera frame. */
function rasterise(path: string, side: number): { data: Uint8ClampedArray; width: number; height: number } {
  const width = side * SCALE;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);
  for (const match of path.matchAll(/M(\d+) (\d+)h(\d+)v1h-\d+z/g)) {
    const [, xs, ys, ws] = match;
    const x0 = Number(xs);
    const y0 = Number(ys);
    for (let y = y0 * SCALE; y < (y0 + 1) * SCALE; y += 1) {
      for (let x = x0 * SCALE; x < (x0 + Number(ws)) * SCALE; x += 1) {
        const i = (y * width + x) * 4;
        data[i] = 0;
        data[i + 1] = 0;
        data[i + 2] = 0;
      }
    }
  }
  return { data, width, height: width };
}

describe('QrCode', () => {
  afterEach(cleanup);

  it('renders an inline svg image with an accessible name and no secret, with no img element or url', () => {
    const { container } = render(<QrCode value={URI} label="QR code for your authenticator app" />);

    const svg = screen.getByRole('img', { name: 'QR code for your authenticator app' });
    expect(svg.tagName.toLowerCase()).toBe('svg');
    expect(svg.getAttribute('aria-label')).not.toContain('JBSWY3DPEHPK3PXP');
    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML).not.toContain('data:');
    expect(container.innerHTML).not.toContain('http');
  });

  it('is drawn dark on white, with a quiet zone of at least four modules', () => {
    const { container } = render(<QrCode value={URI} label="QR" />);

    expect(container.querySelector('rect')?.getAttribute('fill')).toBe('#ffffff');
    expect(container.querySelector('path')?.getAttribute('fill')).toBe('#000000');
    const xs = [...(container.querySelector('path')?.getAttribute('d') ?? '').matchAll(/M(\d+) (\d+)h(\d+)/g)].map((m) => [Number(m[1]), Number(m[3])]);
    expect(Math.min(...xs.map(([x]) => x ?? 0))).toBe(QR_QUIET_ZONE);
    const { size } = buildQrShape(URI);
    expect(Math.max(...xs.map(([x, w]) => (x ?? 0) + (w ?? 0)))).toBeLessThanOrEqual(size - QR_QUIET_ZONE);
  });

  it('encodes exactly the otpauth URI: a QR decoder reads back the same text from the rendered shapes', () => {
    const { container } = render(<QrCode value={URI} label="QR" />);
    const path = container.querySelector('path')?.getAttribute('d') ?? '';
    const { size } = buildQrShape(URI);

    const frame = rasterise(path, size);
    const decoded = jsQR(frame.data, frame.width, frame.height);

    expect(decoded?.data).toBe(URI);
  });

  it('draws a different code for a different value', () => {
    expect(buildQrShape(URI).path).not.toBe(buildQrShape(`${URI}2`).path);
  });
});

/**
 * @file apps/admin/src/features/account/components/qr-code.tsx
 * @feature account
 * @dependencies uqr (zero-dependency, runs in the browser: the value never leaves the page)
 */

'use client';

import { Box } from '@mui/material';
import { encode } from 'uqr';
import { useMemo } from 'react';

/** Quiet zone in modules; the QR specification asks for at least four. */
export const QR_QUIET_ZONE = 4;

interface QrCodeProps {
  /** The text to encode. It is drawn as vector shapes only: never put it in a URL or an image source. */
  value: string;
  /** Accessible name. Must not contain the secret. */
  label: string;
}

interface QrShape {
  path: string;
  size: number;
}

/** Turns the module matrix into one SVG path (horizontal runs of dark modules), plus the full side length. */
export function buildQrShape(value: string): QrShape {
  const { data } = encode(value, { ecc: 'M', boostEcc: false, border: 0 });
  const commands: string[] = [];
  data.forEach((row, y): void => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== true) {
        x += 1;
        continue;
      }
      const start = x;
      while (row[x] === true) {
        x += 1;
      }
      commands.push(`M${String(start + QR_QUIET_ZONE)} ${String(y + QR_QUIET_ZONE)}h${String(x - start)}v1h-${String(x - start)}z`);
    }
  });
  return { path: commands.join(''), size: data.length + QR_QUIET_ZONE * 2 };
}

/**
 * Inline SVG QR code (error correction M) in dark on white with a quiet zone, whatever the theme: scanners need
 * that contrast. Drawn locally; nothing is requested from the network.
 */
export function QrCode({ value, label }: QrCodeProps): React.JSX.Element {
  const shape = useMemo((): QrShape => buildQrShape(value), [value]);
  const side = String(shape.size);
  return (
    <Box sx={{ display: 'flex', justifyContent: 'center' }}>
      <Box sx={{ width: '100%', maxWidth: 220, lineHeight: 0, borderRadius: 1, border: 1, borderColor: 'divider', overflow: 'hidden', bgcolor: '#fff' }}>
      <svg
        role="img"
        aria-label={label}
        viewBox={`0 0 ${side} ${side}`}
        width="100%"
        height="100%"
        shapeRendering="crispEdges"
        data-testid="two-factor-qr"
        style={{ display: 'block' }}
      >
        <rect width={side} height={side} fill="#ffffff" />
        <path d={shape.path} fill="#000000" />
      </svg>
      </Box>
    </Box>
  );
}

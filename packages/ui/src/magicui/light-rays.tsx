/**
 * @file packages/ui/src/magicui/light-rays.tsx
 * @shared Magic UI Light Rays — https://magicui.design/docs/components/light-rays
 * @dependencies @mui/material
 */

'use client';

import { Box, keyframes } from '@mui/material';

const drift = keyframes`
  0% { transform: translateX(-8%) rotate(8deg); }
  100% { transform: translateX(8%) rotate(12deg); }
`;

/**
 * Soft hospitality light wash for the guest hero. Theme tokens only.
 */
export function LightRays(): React.JSX.Element {
  return (
    <Box
      aria-hidden
      sx={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        opacity: 0.35,
        background: (theme) =>
          `repeating-linear-gradient(105deg, transparent 0 28px, ${theme.palette.secondary.main}14 28px 32px, transparent 32px 56px)`,
        animation: `${drift} 18s ease-in-out infinite alternate`,
      }}
    />
  );
}

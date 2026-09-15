/**
 * @file packages/ui/src/magicui/shimmer-button.tsx
 * @shared Magic UI Shimmer Button — https://magicui.design/docs/components/shimmer-button
 * @dependencies @mui/material
 */

'use client';

import { Button, keyframes, type ButtonProps } from '@mui/material';

const shimmer = keyframes`
  0% { transform: translateX(-120%); }
  100% { transform: translateX(120%); }
`;

/**
 * Primary CTA with a light sweep. 8px radius from the theme.
 */
export function ShimmerButton(props: ButtonProps): React.JSX.Element {
  return (
    <Button
      variant="contained"
      {...props}
      sx={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 1,
        ...props.sx,
        '&::after': {
          content: '""',
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent)',
          animation: `${shimmer} 2.4s ease-in-out infinite`,
          pointerEvents: 'none',
        },
      }}
    />
  );
}

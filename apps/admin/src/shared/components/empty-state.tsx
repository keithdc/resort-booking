/**
 * @file apps/admin/src/shared/components/empty-state.tsx
 * @shared Friendly empty region: icon, what is missing, what to do
 * @dependencies MUI
 */

'use client';

import { Box, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}

/**
 * Centered empty state on a dashed tile. The icon is decoration; the words carry the meaning.
 */
export function EmptyState({ icon, title, hint, action }: EmptyStateProps): React.JSX.Element {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 1,
        py: 4,
        px: 3,
        border: 1,
        borderStyle: 'dashed',
        borderColor: 'divider',
        borderRadius: 2,
        bgcolor: 'background.paper',
      }}
    >
      <Box
        aria-hidden
        sx={{
          width: 48,
          height: 48,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%',
          bgcolor: (theme): string => alpha(theme.palette.primary.main, 0.1),
          color: 'primary.main',
          '& svg': { fontSize: 24 },
        }}
      >
        {icon}
      </Box>
      <Typography variant="subtitle1">{title}</Typography>
      {hint !== undefined ? (
        <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 420 }}>
          {hint}
        </Typography>
      ) : null}
      {action}
    </Box>
  );
}

/**
 * @file apps/admin/src/features/reservations/components/stay-block.tsx
 * @feature reservations
 * @dependencies MUI
 */

import { Box, Divider, Stack, Typography } from '@mui/material';

interface StayBlockProps {
  title: string;
  children: React.ReactNode;
}

/**
 * A titled card inside the booking dialog.
 */
export function StayBlock({ title, children }: StayBlockProps): React.JSX.Element {
  return (
    <Box sx={{ p: 2, border: 1, borderColor: 'divider', borderRadius: 1, bgcolor: 'background.paper' }}>
      <Typography variant="subtitle2" sx={{ mb: 1.5 }}>
        {title}
      </Typography>
      <Divider sx={{ mb: 1.5 }} />
      <Stack spacing={1.25}>{children}</Stack>
    </Box>
  );
}

interface StayFactProps {
  label: string;
  value: string;
}

/**
 * A small label with its value underneath.
 */
export function StayFact({ label, value }: StayFactProps): React.JSX.Element {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" display="block">
        {label}
      </Typography>
      <Typography>{value}</Typography>
    </Box>
  );
}

/**
 * @file apps/admin/src/shared/components/section-card.tsx
 * @shared A card with an icon header, used to group a form or a block of content
 * @dependencies MUI, icon-chip
 */

'use client';

import { Box, Paper, Stack, Typography } from '@mui/material';
import type { ReactNode } from 'react';
import type { AvatarTone } from '@/shared/utils/avatar-color';
import { IconChip } from './icon-chip';

interface SectionCardProps {
  icon: ReactNode;
  title: string;
  description?: string;
  tone?: AvatarTone;
  /** A step label like "1 · Sign in" shown above the title. */
  eyebrow?: string;
  /** Right side of the header, e.g. a button. */
  action?: ReactNode;
  /** Heading level under the page h1. */
  level?: 2 | 3;
  children: ReactNode;
}

/**
 * White card, tinted icon, clear title and one line of help; the content sits below a divider.
 */
export function SectionCard({
  icon,
  title,
  description,
  tone = 'primary',
  eyebrow,
  action,
  level = 2,
  children,
}: SectionCardProps): React.JSX.Element {
  return (
    <Paper component="section" aria-label={title} elevation={1} sx={{ borderRadius: 2, overflow: 'hidden' }}>
      <Stack
        direction="row"
        spacing={2}
        alignItems="center"
        sx={{ px: 2.5, py: 1.75, borderBottom: 1, borderColor: 'divider', bgcolor: 'action.hover' }}
      >
        <IconChip icon={icon} tone={tone} size={36} />
        <Box sx={{ flexGrow: 1, minWidth: 0 }}>
          {eyebrow !== undefined ? (
            <Typography variant="overline" color="secondary.main" sx={{ lineHeight: 1.6 }}>
              {eyebrow}
            </Typography>
          ) : null}
          <Typography variant="h6" component={level === 2 ? 'h2' : 'h3'}>
            {title}
          </Typography>
          {description !== undefined ? (
            <Typography variant="body2" color="text.secondary">
              {description}
            </Typography>
          ) : null}
        </Box>
        {action}
      </Stack>
      <Box sx={{ p: 2.5 }}>{children}</Box>
    </Paper>
  );
}

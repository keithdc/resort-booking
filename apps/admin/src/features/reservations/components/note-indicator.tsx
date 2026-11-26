/**
 * @file apps/admin/src/features/reservations/components/note-indicator.tsx
 * @feature reservations
 * @dependencies MUI
 */

import StickyNote2OutlinedIcon from '@mui/icons-material/StickyNote2Outlined';
import { Box, Tooltip } from '@mui/material';
import { noteCountLabel } from '../utils/staff-notes';

interface NoteIndicatorProps {
  count: number;
}

/**
 * A small note icon with the count, shown on booking rows that have staff notes ("2 staff notes"). Nothing when there are
 * none. The words are in the accessible name and the tooltip, so the icon never carries the meaning alone.
 */
export function NoteIndicator({ count }: NoteIndicatorProps): React.JSX.Element | null {
  if (count <= 0) {
    return null;
  }
  const label = noteCountLabel(count);
  return (
    <Tooltip title={label}>
      <Box
        component="span"
        role="img"
        aria-label={label}
        sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.25, color: 'warning.dark', fontSize: 12, fontWeight: 700, lineHeight: 1 }}
      >
        <StickyNote2OutlinedIcon sx={{ fontSize: 16 }} />
        {count}
      </Box>
    </Tooltip>
  );
}

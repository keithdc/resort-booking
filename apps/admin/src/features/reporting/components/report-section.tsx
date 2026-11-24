/**
 * @file apps/admin/src/features/reporting/components/report-section.tsx
 * @feature reporting
 * @dependencies metric-definitions
 */

import { Box, Typography } from '@mui/material';
import { EMPTY_STATES, SECTION_CAPTIONS, type EmptyStateKey, type SectionKey } from '../utils/metric-definitions';

interface ReportSectionProps {
  section: SectionKey;
  /** Heading level under the page's h1: 2 for a top section, 3 inside a tab. */
  level?: 2 | 3;
  children: React.ReactNode;
}

/**
 * A titled block with the plain sentence under it that says what it shows and how to use it.
 */
export function ReportSection({ section, level = 3, children }: ReportSectionProps): React.JSX.Element {
  const { title, caption } = SECTION_CAPTIONS[section];
  return (
    <Box component="section" aria-label={title} sx={{ mb: 7, breakInside: 'avoid-page' }}>
      <Typography variant={level === 2 ? 'h5' : 'h6'} component={level === 2 ? 'h2' : 'h3'} sx={{ mb: 0.75 }}>
        {title}
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 680, lineHeight: 1.6 }}>
        {caption}
      </Typography>
      {children}
    </Box>
  );
}

interface EmptyNoteProps {
  state: EmptyStateKey;
}

/**
 * An empty section: says why it is empty and what to try.
 */
export function EmptyNote({ state }: EmptyNoteProps): React.JSX.Element {
  return (
    <Typography color="text.secondary" sx={{ py: 3, px: 3, border: 1, borderColor: 'divider', borderStyle: 'dashed', borderRadius: 1 }}>
      {EMPTY_STATES[state]}
    </Typography>
  );
}

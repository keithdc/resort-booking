/**
 * @file apps/admin/src/features/reporting/components/print-title-block.tsx
 * @feature reporting
 */

import { Box, Typography } from '@mui/material';

interface PrintTitleBlockProps {
  propertyName: string;
  periodLabel: string;
  generatedOn: string;
}

/**
 * The heading of the printed report. Invisible on screen, shown when printing.
 */
export function PrintTitleBlock({ propertyName, periodLabel, generatedOn }: PrintTitleBlockProps): React.JSX.Element {
  return (
    <Box data-print="only" sx={{ display: 'none', mb: 3, pb: 2, borderBottom: 2, borderColor: 'primary.main' }}>
      <Typography variant="h4" component="p">
        Humphreys — Report
      </Typography>
      <Typography>{propertyName}</Typography>
      <Typography>{periodLabel}</Typography>
      <Typography variant="body2" color="text.secondary">
        Generated {generatedOn}
      </Typography>
    </Box>
  );
}

/**
 * @file apps/admin/src/features/reporting/components/report-glossary.tsx
 * @feature reporting
 * @dependencies metric-definitions
 */

import { Box, Typography } from '@mui/material';
import { METRIC_DEFINITIONS, type MetricKey } from '../utils/metric-definitions';

const KEYS = Object.keys(METRIC_DEFINITIONS) as MetricKey[];

/**
 * "What the numbers mean": every definition, shown only in the printed report (on screen each number
 * has its own (i) tooltip).
 */
export function ReportGlossary(): React.JSX.Element {
  return (
    <Box data-print="only" component="section" aria-label="What the numbers mean" sx={{ display: 'none', mt: 4, breakInside: 'avoid-page' }}>
      <Typography variant="h5" component="h2" gutterBottom>
        What the numbers mean
      </Typography>
      <Box component="dl" sx={{ m: 0 }}>
        {KEYS.map((key: MetricKey): React.JSX.Element => (
          <Box key={key} sx={{ mb: 1.5 }}>
            <Typography component="dt" sx={{ fontWeight: 600 }}>
              {METRIC_DEFINITIONS[key].label}
            </Typography>
            <Typography component="dd" variant="body2" sx={{ m: 0 }}>
              {METRIC_DEFINITIONS[key].definition}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

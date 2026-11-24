/**
 * @file apps/admin/src/features/reporting/components/metric-info.tsx
 * @feature reporting
 * @dependencies metric-definitions
 */

'use client';

import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { IconButton, Tooltip } from '@mui/material';
import { METRIC_DEFINITIONS, type MetricKey } from '../utils/metric-definitions';

interface MetricInfoProps {
  metric: MetricKey;
}

/**
 * A small (i) beside a number. Hover, focus or tap it to read what the number means. Hidden when
 * printing: the printed report ends with the full list of definitions instead.
 */
export function MetricInfo({ metric }: MetricInfoProps): React.JSX.Element {
  const { label, definition } = METRIC_DEFINITIONS[metric];
  return (
    <Tooltip title={definition} arrow enterTouchDelay={0} leaveTouchDelay={6000}>
      <IconButton size="small" aria-label={`What does ${label} mean?`} data-print="hide" sx={{ p: 0.25, color: 'text.secondary' }}>
        <InfoOutlinedIcon fontSize="inherit" />
      </IconButton>
    </Tooltip>
  );
}

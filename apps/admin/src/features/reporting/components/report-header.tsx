/**
 * @file apps/admin/src/features/reporting/components/report-header.tsx
 * @feature reporting
 * @dependencies report-range
 */

'use client';

import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { PageHeader } from '@/shared/components/page-header';
import type { PropertySummary } from '@resort-booking/shared-types';
import type { ReportPeriod } from '../hooks/use-report-period';
import { isRangePreset, REPORT_RANGE_OPTIONS } from '../utils/report-range';

const ALL_PROPERTIES = 'all';

interface ReportHeaderProps {
  period: ReportPeriod;
  properties: PropertySummary[];
  propertyId: string;
  onPropertyChange: (propertyId: string) => void;
  loading: boolean;
  /** There is a report to download or print. */
  canExport: boolean;
  onDownload: () => void;
  onPrint: () => void;
  onRefresh: () => void;
}

/**
 * Title, the period buttons, the property filter, and the Download / Print buttons. All of it is
 * hidden when the report is printed.
 */
export function ReportHeader({
  period,
  properties,
  propertyId,
  onPropertyChange,
  loading,
  canExport,
  onDownload,
  onPrint,
  onRefresh,
}: ReportHeaderProps): React.JSX.Element {
  return (
    <Box data-print="hide" sx={{ mb: 6 }}>
      <PageHeader
        icon={<AssessmentOutlinedIcon />}
        tone="info"
        title="Reports"
        description="How your properties are doing. Choose a period and a property; everything below follows."
      />

      <Paper elevation={1} sx={{ p: 2.5, borderRadius: 2 }}>
      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={3} alignItems={{ lg: 'center' }} useFlexGap flexWrap="wrap">
        <ToggleButtonGroup
          exclusive
          size="small"
          color="primary"
          value={period.preset}
          aria-label="Period"
          onChange={(_event, next: string | null): void => {
            if (next !== null && isRangePreset(next)) {
              period.setPreset(next);
            }
          }}
          sx={{ flexWrap: 'wrap' }}
        >
          {REPORT_RANGE_OPTIONS.map((option): React.JSX.Element => (
            <ToggleButton key={option.value} value={option.value} sx={{ textTransform: 'none', px: 2 }}>
              {option.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel id="report-property">Property</InputLabel>
          <Select
            labelId="report-property"
            label="Property"
            value={propertyId === '' ? ALL_PROPERTIES : propertyId}
            onChange={(event): void => onPropertyChange(event.target.value === ALL_PROPERTIES ? '' : event.target.value)}
          >
            <MenuItem value={ALL_PROPERTIES}>All properties</MenuItem>
            {properties.map((property): React.JSX.Element => (
              <MenuItem key={property.id} value={property.id}>
                {property.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ ml: { lg: 'auto' } }}>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={onRefresh} disabled={loading}>
            Refresh
          </Button>
          <Button variant="outlined" startIcon={<DownloadOutlinedIcon />} onClick={onDownload} disabled={!canExport}>
            Download CSV
          </Button>
          <Button variant="contained" startIcon={<PrintOutlinedIcon />} onClick={onPrint} disabled={!canExport}>
            Print / Save as PDF
          </Button>
        </Stack>
      </Stack>

      {period.preset === 'custom' ? (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ mt: 2 }}>
          <TextField
            size="small"
            type="date"
            label="First day"
            value={period.firstDay}
            onChange={(event): void => period.setFirstDay(event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            size="small"
            type="date"
            label="Last day"
            value={period.lastDay}
            onChange={(event): void => period.setLastDay(event.target.value)}
            error={period.problem !== null}
            helperText={period.problem ?? 'Both days are included.'}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Stack>
      ) : null}
      </Paper>
    </Box>
  );
}

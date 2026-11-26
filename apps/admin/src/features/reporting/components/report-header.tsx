/**
 * @file apps/admin/src/features/reporting/components/report-header.tsx
 * @feature reporting
 * @dependencies report-range
 */

'use client';

import DateRangeOutlinedIcon from '@mui/icons-material/DateRangeOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
  Box,
  Button,
  Chip,
  FormControl,
  InputLabel,
  ListItemText,
  ListSubheader,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
} from '@mui/material';
import { PageHeader } from '@/shared/components/page-header';
import { useMemo } from 'react';
import type { PropertySummary } from '@resort-booking/shared-types';
import type { ReportPeriod } from '../hooks/use-report-period';
import { describePeriod, describePreset, isRangePreset, REPORT_RANGE_OPTIONS, type ReportRangeOption } from '../utils/report-range';

const ALL_PROPERTIES = 'all';

type PeriodMenuEntry = { kind: 'group'; group: string } | { kind: 'option'; option: ReportRangeOption; dates: string };

/** The period menu: option groups with the dates each one covers today. */
function buildPeriodMenu(now: Date): PeriodMenuEntry[] {
  const entries: PeriodMenuEntry[] = [];
  let group = '';
  for (const option of REPORT_RANGE_OPTIONS) {
    if (option.group !== group) {
      group = option.group;
      entries.push({ kind: 'group', group });
    }
    entries.push({ kind: 'option', option, dates: describePreset(option.value, now) });
  }
  return entries;
}

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
  const periodMenu = useMemo((): PeriodMenuEntry[] => buildPeriodMenu(new Date()), []);
  const rangeLabel = period.range === null ? '' : describePeriod(period.range.from, period.range.to);
  return (
    <Box data-print="hide" sx={{ mb: { xs: 4, md: 6 } }}>
      <PageHeader
        icon={<AssessmentOutlinedIcon />}
        tone="info"
        title="Reports"
        description="How your properties are doing. Choose a period and a property; everything below follows."
      />

      <Paper elevation={1} sx={{ p: { xs: 1.5, sm: 2.5 }, borderRadius: 2 }}>
      <Stack direction={{ xs: 'column', lg: 'row' }} spacing={3} alignItems={{ lg: 'center' }} useFlexGap flexWrap="wrap">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', width: { xs: '100%', lg: 'auto' } }}>
          <FormControl size="small" sx={{ minWidth: { sm: 220 }, width: { xs: '100%', sm: 'auto' } }}>
            <InputLabel id="report-period">Period</InputLabel>
            <Select
              labelId="report-period"
              label="Period"
              value={period.preset}
              onChange={(event): void => {
                if (isRangePreset(event.target.value)) {
                  period.setPreset(event.target.value);
                }
              }}
              MenuProps={{ slotProps: { paper: { sx: { maxHeight: 360 } } } }}
              renderValue={(value): string => REPORT_RANGE_OPTIONS.find((option): boolean => option.value === value)?.label ?? ''}
            >
              {periodMenu.map((entry): React.JSX.Element =>
                entry.kind === 'group' ? (
                  <ListSubheader key={entry.group}>{entry.group}</ListSubheader>
                ) : (
                  <MenuItem key={entry.option.value} value={entry.option.value}>
                    <ListItemText primary={entry.option.label} secondary={entry.dates} />
                  </MenuItem>
                ),
              )}
            </Select>
          </FormControl>
          <Chip
            icon={<DateRangeOutlinedIcon />}
            color="primary"
            variant="outlined"
            label={rangeLabel === '' ? 'Choose the first and last day' : rangeLabel}
            aria-label={`Dates covered: ${rangeLabel === '' ? 'not chosen yet' : rangeLabel}`}
            sx={{ fontWeight: 600, maxWidth: '100%' }}
          />
        </Box>

        <FormControl size="small" sx={{ minWidth: { sm: 220 }, width: { xs: '100%', sm: 'auto' } }}>
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

        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ ml: { lg: 'auto' }, '& > button': { flex: { xs: '1 1 140px', lg: '0 0 auto' } } }}>
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

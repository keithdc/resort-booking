/**
 * @file apps/admin/src/features/reservations/components/calendar-toolbar.tsx
 * @feature reservations
 * @dependencies MUI
 */

import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayOutlinedIcon from '@mui/icons-material/TodayOutlined';
import { Box, Button, FormControl, IconButton, InputLabel, MenuItem, Paper, Select, Stack, Typography } from '@mui/material';
import type { PropertySummary } from '@resort-booking/shared-types';
import { VISUALLY_HIDDEN } from '@/shared/utils/visually-hidden';
import { monthNames, yearOptions } from '../utils/calendar-cells';

const ALL_PROPERTIES = 'all';

/** Hidden on screen, still read out: the month in words follows the pickers. */
interface CalendarToolbarProps {
  /** The month in words, announced to screen readers when it changes. */
  label: string;
  year: number;
  /** 1-12. */
  month: number;
  /** The real current year, to centre the year list. */
  currentYear: number;
  onSelectMonth: (year: number, month: number) => void;
  properties: PropertySummary[];
  propertyId: string;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  onPropertyChange: (propertyId: string) => void;
}

/**
 * Month navigation (previous, next, Today) and the property filter, in one bar above the grid.
 */
export function CalendarToolbar({
  label,
  year,
  month,
  currentYear,
  onSelectMonth,
  properties,
  propertyId,
  onPrevious,
  onNext,
  onToday,
  onPropertyChange,
}: CalendarToolbarProps): React.JSX.Element {
  return (
    <Paper elevation={1} sx={{ p: { xs: 1.5, sm: 2 }, mb: 2, borderRadius: 2 }}>
      <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap>
        {/* Phone: months and year on one row, then previous / Today / next. Wider: one row. */}
        <Box
          sx={{
            width: { xs: '100%', sm: 'auto' },
            display: { xs: 'grid', sm: 'flex' },
            gridTemplateColumns: '44px 1fr 1fr 44px',
            gridTemplateAreas: { xs: '"month month year year" "prev today today next"', sm: 'none' },
            gap: 1,
            alignItems: 'center',
          }}
        >
          <IconButton aria-label="Previous month" onClick={onPrevious} color="primary" sx={{ gridArea: 'prev' }}>
            <ChevronLeftIcon />
          </IconButton>
          <Typography variant="h6" component="h2" aria-live="polite" sx={VISUALLY_HIDDEN}>
            {label}
          </Typography>
          <FormControl size="small" sx={{ minWidth: { sm: 140 }, gridArea: 'month' }}>
            <InputLabel id="calendar-month">Month</InputLabel>
            <Select
              labelId="calendar-month"
              label="Month"
              value={month}
              onChange={(event): void => onSelectMonth(year, Number(event.target.value))}
              MenuProps={{ slotProps: { paper: { sx: { maxHeight: 360 } } } }}
            >
              {monthNames().map((name, index): React.JSX.Element => (
                <MenuItem key={name} value={index + 1}>
                  {name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: { sm: 100 }, gridArea: 'year' }}>
            <InputLabel id="calendar-year">Year</InputLabel>
            <Select
              labelId="calendar-year"
              label="Year"
              value={year}
              onChange={(event): void => onSelectMonth(Number(event.target.value), month)}
              MenuProps={{ slotProps: { paper: { sx: { maxHeight: 360 } } } }}
            >
              {yearOptions(year, currentYear).map((option): React.JSX.Element => (
                <MenuItem key={option} value={option}>
                  {option}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <IconButton aria-label="Next month" onClick={onNext} color="primary" sx={{ gridArea: 'next' }}>
            <ChevronRightIcon />
          </IconButton>
          <Button variant="outlined" startIcon={<TodayOutlinedIcon />} onClick={onToday} sx={{ gridArea: 'today' }}>
            Today
          </Button>
        </Box>
        <FormControl size="small" sx={{ minWidth: { sm: 240 }, width: { xs: '100%', sm: 'auto' } }}>
          <InputLabel id="property-filter">Property</InputLabel>
          <Select
            labelId="property-filter"
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
      </Stack>
    </Paper>
  );
}

/**
 * @file apps/admin/src/features/reservations/components/calendar-toolbar.tsx
 * @feature reservations
 * @dependencies MUI
 */

import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import TodayOutlinedIcon from '@mui/icons-material/TodayOutlined';
import { Button, FormControl, IconButton, InputLabel, MenuItem, Paper, Select, Stack, Typography } from '@mui/material';
import type { PropertySummary } from '@resort-booking/shared-types';

const ALL_PROPERTIES = 'all';

interface CalendarToolbarProps {
  label: string;
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
  properties,
  propertyId,
  onPrevious,
  onNext,
  onToday,
  onPropertyChange,
}: CalendarToolbarProps): React.JSX.Element {
  return (
    <Paper elevation={1} sx={{ p: 2, mb: 2, borderRadius: 2 }}>
      <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between" flexWrap="wrap" useFlexGap>
        <Stack direction="row" spacing={1} alignItems="center">
          <IconButton aria-label="Previous month" onClick={onPrevious} color="primary">
            <ChevronLeftIcon />
          </IconButton>
          <Typography variant="h6" component="h2" aria-live="polite" sx={{ minWidth: 168, textAlign: 'center' }}>
            {label}
          </Typography>
          <IconButton aria-label="Next month" onClick={onNext} color="primary">
            <ChevronRightIcon />
          </IconButton>
          <Button variant="outlined" startIcon={<TodayOutlinedIcon />} onClick={onToday}>
            Today
          </Button>
        </Stack>
        <FormControl size="small" sx={{ minWidth: 240 }}>
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

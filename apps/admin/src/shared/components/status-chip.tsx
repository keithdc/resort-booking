/**
 * @file apps/admin/src/shared/components/status-chip.tsx
 * @shared Status chip with its icon (colour + icon + words, never colour alone)
 * @dependencies MUI icons by path
 */

'use client';

import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined';
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineOutlinedIcon from '@mui/icons-material/ErrorOutlineOutlined';
import EventRepeatOutlinedIcon from '@mui/icons-material/EventRepeatOutlined';
import HotelOutlinedIcon from '@mui/icons-material/HotelOutlined';
import HourglassTopOutlinedIcon from '@mui/icons-material/HourglassTopOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import TaskAltOutlinedIcon from '@mui/icons-material/TaskAltOutlined';
import TimerOffOutlinedIcon from '@mui/icons-material/TimerOffOutlined';
import { Chip } from '@mui/material';
import type { ReactElement } from 'react';
import type { StatusIconKey, StatusStyle } from '@/shared/utils/status-style';

const ICONS: Record<StatusIconKey, ReactElement> = {
  booked: <CheckCircleOutlineIcon />,
  'in-house': <HotelOutlinedIcon />,
  'checked-out': <LogoutOutlinedIcon />,
  rebook: <EventRepeatOutlinedIcon />,
  hold: <HourglassTopOutlinedIcon />,
  cancelled: <CancelOutlinedIcon />,
  expired: <TimerOffOutlinedIcon />,
  'refund-done': <TaskAltOutlinedIcon />,
  'refund-pending': <AccessTimeOutlinedIcon />,
  'refund-failed': <ErrorOutlineOutlinedIcon />,
};

/**
 * The icon for a status key (also used by legends).
 */
export function statusIcon(key: StatusIconKey): ReactElement {
  return ICONS[key];
}

interface StatusChipProps {
  status: StatusStyle;
  /** Overrides the label, e.g. "Booked 3" in a legend or count. */
  label?: string;
  size?: 'small' | 'medium';
}

/**
 * A tonal chip: icon + words, coloured by tone.
 */
export function StatusChip({ status, label, size = 'small' }: StatusChipProps): React.JSX.Element {
  return (
    <Chip
      size={size}
      icon={ICONS[status.icon]}
      color={status.tone}
      label={label ?? status.label}
    />
  );
}

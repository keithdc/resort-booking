/**
 * @file apps/admin/src/shared/components/nav-config.tsx
 * @shared The staff navigation: groups, items, icons (outlined idle, filled active)
 * @dependencies MUI icons by path
 */

import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import AssessmentIcon from '@mui/icons-material/Assessment';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import HolidayVillageIcon from '@mui/icons-material/HolidayVillage';
import HolidayVillageOutlinedIcon from '@mui/icons-material/HolidayVillageOutlined';
import ReplayIcon from '@mui/icons-material/Replay';
import ReplayOutlinedIcon from '@mui/icons-material/ReplayOutlined';
import type { ReactElement } from 'react';

export type NavKey = 'calendar' | 'refunds' | 'reports' | 'properties' | 'account';

export interface NavItem {
  key: NavKey;
  href: string;
  label: string;
  hint: string;
  idleIcon: ReactElement;
  activeIcon: ReactElement;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Operations',
    items: [
      {
        key: 'calendar',
        href: '/',
        label: 'Calendar',
        hint: 'Who is staying',
        idleIcon: <CalendarMonthOutlinedIcon />,
        activeIcon: <CalendarMonthIcon />,
      },
      {
        key: 'refunds',
        href: '/refunds',
        label: 'Refunds',
        hint: 'Money to send back',
        idleIcon: <ReplayOutlinedIcon />,
        activeIcon: <ReplayIcon />,
      },
    ],
  },
  {
    label: 'Insights',
    items: [
      {
        key: 'reports',
        href: '/reports',
        label: 'Reports',
        hint: 'Nights and revenue',
        idleIcon: <AssessmentOutlinedIcon />,
        activeIcon: <AssessmentIcon />,
      },
    ],
  },
  {
    label: 'Setup',
    items: [
      {
        key: 'properties',
        href: '/properties',
        label: 'Properties',
        hint: 'Places and stays',
        idleIcon: <HolidayVillageOutlinedIcon />,
        activeIcon: <HolidayVillageIcon />,
      },
      {
        key: 'account',
        href: '/configuration',
        label: 'Account',
        hint: 'Owner, emails, bank',
        idleIcon: <AccountCircleOutlinedIcon />,
        activeIcon: <AccountCircleIcon />,
      },
    ],
  },
];

/**
 * @file apps/admin/src/shared/components/nav-config.tsx
 * @shared The staff navigation: groups, items, icons (outlined idle, filled active)
 * @dependencies MUI icons by path
 */

import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import AssessmentIcon from '@mui/icons-material/Assessment';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import FactCheckOutlinedIcon from '@mui/icons-material/FactCheckOutlined';
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import HolidayVillageIcon from '@mui/icons-material/HolidayVillage';
import HolidayVillageOutlinedIcon from '@mui/icons-material/HolidayVillageOutlined';
import GroupsIcon from '@mui/icons-material/Groups';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import ReplayIcon from '@mui/icons-material/Replay';
import ReplayOutlinedIcon from '@mui/icons-material/ReplayOutlined';
import type { StaffRole } from '@resort-booking/shared-types';
import type { ReactElement } from 'react';

export type NavKey = 'calendar' | 'refunds' | 'reports' | 'properties' | 'team' | 'audit' | 'account';

export interface NavItem {
  key: NavKey;
  href: string;
  label: string;
  hint: string;
  idleIcon: ReactElement;
  activeIcon: ReactElement;
  /** Hidden from employees: the API answers 403 for them, so the link would only lead to a dead end. */
  adminOnly?: boolean;
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
        adminOnly: true,
      },
      {
        key: 'team',
        href: '/team',
        label: 'Team',
        hint: 'People and roles',
        idleIcon: <GroupsOutlinedIcon />,
        activeIcon: <GroupsIcon />,
        adminOnly: true,
      },
      {
        key: 'audit',
        href: '/audit',
        label: 'Audit log',
        hint: 'Who changed what',
        idleIcon: <FactCheckOutlinedIcon />,
        activeIcon: <FactCheckIcon />,
        adminOnly: true,
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

/**
 * The groups a role may see. Until the role is known (`null`) only the everyday links show, so an employee never
 * sees admin links flash; admins get the rest a moment later.
 */
export function navGroupsFor(role: StaffRole | null): NavGroup[] {
  return NAV_GROUPS.map((group): NavGroup => ({
    ...group,
    items: group.items.filter((item): boolean => item.adminOnly !== true || role === 'admin'),
  })).filter((group): boolean => group.items.length > 0);
}

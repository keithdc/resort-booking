/**
 * @file apps/admin/src/shared/components/staff-shell.tsx
 * @shared Admin sidebar and top bar
 * @dependencies @mui/material
 */

'use client';

import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import AssessmentOutlinedIcon from '@mui/icons-material/AssessmentOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import HolidayVillageOutlinedIcon from '@mui/icons-material/HolidayVillageOutlined';
import ReplayOutlinedIcon from '@mui/icons-material/ReplayOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import {
  AppBar,
  Box,
  Button,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Typography,
} from '@mui/material';
import { BlurFade } from '@resort-booking/ui';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { clearStaffSession } from '@/shared/services/api-client';
import { logoutStaff } from '@/features/identity/services/staff-identity-api';

const DRAWER_WIDTH = 280;

interface StaffShellProps {
  children: ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  hint: string;
  icon: typeof CalendarMonthOutlinedIcon;
}

const NAV: NavItem[] = [
  { href: '/', label: 'Calendar', hint: 'Who is staying', icon: CalendarMonthOutlinedIcon },
  { href: '/properties', label: 'Properties', hint: 'Places and stays', icon: HolidayVillageOutlinedIcon },
  { href: '/configuration', label: 'Account', hint: 'Owner, emails, bank', icon: AccountCircleOutlinedIcon },
  { href: '/refunds', label: 'Refunds', hint: 'Money to send back', icon: ReplayOutlinedIcon },
  { href: '/reports', label: 'Reports', hint: 'Nights and revenue', icon: AssessmentOutlinedIcon },
];

/**
 * Quiet staff chrome. Properties live on their own page, not duplicated here.
 */
export function StaffShell({ children }: StaffShellProps): React.JSX.Element {
  const pathname = usePathname();
  const router = useRouter();

  if (pathname === '/login') {
    return <>{children}</>;
  }

  const onLogout = async (): Promise<void> => {
    try {
      await logoutStaff();
    } catch {
      // Cookie/local session still cleared below.
    }
    await clearStaffSession();
    router.replace('/login');
    router.refresh();
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        color="inherit"
        elevation={0}
        sx={{
          borderBottom: 1,
          borderColor: 'divider',
          width: { sm: `calc(100% - ${DRAWER_WIDTH}px)` },
          ml: { sm: `${DRAWER_WIDTH}px` },
        }}
      >
        <Toolbar sx={{ justifyContent: 'space-between', px: { xs: 2, md: 4 } }}>
          <Box>
            <Typography variant="subtitle1" component="div" sx={{ lineHeight: 1.2 }}>
              Humphreys staff
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Direct booking
            </Typography>
          </Box>
          <Button
            color="inherit"
            startIcon={<LogoutOutlinedIcon />}
            onClick={(): void => {
              void onLogout();
            }}
          >
            Sign out
          </Button>
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: DRAWER_WIDTH,
            boxSizing: 'border-box',
            borderRight: 1,
            borderColor: 'divider',
            bgcolor: 'background.default',
            px: 1.5,
          },
        }}
      >
        <Toolbar />
        <List sx={{ pt: 3 }}>
          {NAV.map((item): React.JSX.Element => {
            const selected =
              item.href === '/'
                ? pathname === '/'
                : item.href === '/properties'
                  ? pathname.startsWith('/properties')
                  : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <ListItemButton
                key={item.href}
                component={Link}
                href={item.href}
                selected={selected}
                sx={{ borderRadius: 1, mb: 1, py: 1.25 }}
              >
                <ListItemIcon sx={{ minWidth: 40, color: selected ? 'primary.main' : 'text.secondary' }}>
                  <Icon />
                </ListItemIcon>
                <ListItemText primary={item.label} secondary={item.hint} />
              </ListItemButton>
            );
          })}
        </List>
      </Drawer>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          width: { sm: `calc(100% - ${DRAWER_WIDTH}px)` },
          px: { xs: 3, md: 6 },
          py: { xs: 3, md: 5 },
          mt: 8,
          maxWidth: 1280,
        }}
      >
        <BlurFade inView={false}>{children}</BlurFade>
      </Box>
    </Box>
  );
}

/**
 * @file apps/admin/src/shared/components/staff-shell.tsx
 * @shared Admin layout: sidebar (rail or full), mobile drawer, page area
 * @dependencies @mui/material, staff-sidebar
 */

'use client';

import MenuIcon from '@mui/icons-material/Menu';
import { AppBar, Box, Drawer, IconButton, Toolbar, Typography } from '@mui/material';
import { BlurFade } from '@resort-booking/ui';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { logoutStaff } from '@/features/identity/services/staff-identity-api';
import { useSidebarCollapsed } from '@/shared/hooks/use-sidebar-collapsed';
import { useSidebarData } from '@/shared/hooks/use-sidebar-data';
import { clearStaffSession } from '@/shared/services/api-client';
import { SIDEBAR_RAIL_WIDTH, SIDEBAR_WIDTH, StaffSidebar } from './staff-sidebar';

interface StaffShellProps {
  children: ReactNode;
}

/**
 * Staff chrome. Desktop: a sidebar that can fold to an icon rail (remembered). Phone and tablet:
 * a slim top bar with a menu button that opens the same sidebar as a drawer.
 */
export function StaffShell({ children }: StaffShellProps): React.JSX.Element {
  const pathname = usePathname();
  const router = useRouter();
  const { collapsed, toggle } = useSidebarCollapsed();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const isLogin = pathname === '/login';
  const { profile, refundsWaiting } = useSidebarData(!isLogin);

  if (isLogin) {
    return <>{children}</>;
  }

  const onLogout = (): void => {
    void (async (): Promise<void> => {
      try {
        await logoutStaff();
      } catch {
        // Cookie/local session still cleared below.
      }
      await clearStaffSession();
      router.replace('/login');
      router.refresh();
    })();
  };

  const railWidth = collapsed ? SIDEBAR_RAIL_WIDTH : SIDEBAR_WIDTH;

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{ display: { md: 'none' }, bgcolor: 'primary.dark', color: 'primary.contrastText' }}
        data-print="hide"
      >
        <Toolbar>
          <IconButton color="inherit" edge="start" aria-label="Open menu" onClick={(): void => setDrawerOpen(true)} sx={{ mr: 1 }}>
            <MenuIcon />
          </IconButton>
          <Typography variant="subtitle1" component="div" sx={{ fontWeight: 700 }}>
            Humphreys staff
          </Typography>
        </Toolbar>
      </AppBar>

      <Drawer
        variant="permanent"
        data-print="hide"
        sx={{
          display: { xs: 'none', md: 'block' },
          width: railWidth,
          flexShrink: 0,
          transition: 'width 150ms',
          '& .MuiDrawer-paper': {
            width: railWidth,
            boxSizing: 'border-box',
            border: 0,
            overflowX: 'hidden',
            transition: 'width 150ms',
          },
        }}
      >
        <StaffSidebar
          pathname={pathname}
          collapsed={collapsed}
          onToggleCollapsed={toggle}
          profile={profile}
          refundsWaiting={refundsWaiting}
          onLogout={onLogout}
        />
      </Drawer>
      <Drawer
        variant="temporary"
        open={drawerOpen}
        onClose={(): void => setDrawerOpen(false)}
        ModalProps={{ keepMounted: false }}
        sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: SIDEBAR_WIDTH, border: 0 } }}
      >
        <StaffSidebar
          pathname={pathname}
          collapsed={false}
          profile={profile}
          refundsWaiting={refundsWaiting}
          onLogout={onLogout}
          onNavigate={(): void => setDrawerOpen(false)}
        />
      </Drawer>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          minWidth: 0,
          px: { xs: 2, sm: 3, md: 6 },
          py: { xs: 3, md: 5 },
          mt: { xs: 7, md: 0 },
          maxWidth: 1360,
        }}
      >
        <BlurFade inView={false}>{children}</BlurFade>
      </Box>
    </Box>
  );
}

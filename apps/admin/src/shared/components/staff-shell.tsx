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
import { useIdleLogout } from '@/shared/hooks/use-idle-logout';
import { clearStaffSession } from '@/shared/services/api-client';
import { isBarePath } from '@/shared/utils/public-paths';
import { SIDEBAR_RAIL_WIDTH, SIDEBAR_WIDTH, StaffSidebar } from './staff-sidebar';

/** Height of the phone top bar, in px (the page area is pushed down by the same amount). */
const MOBILE_BAR_HEIGHT = 56;

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
  const isBare = isBarePath(pathname);
  const { profile, refundsWaiting } = useSidebarData(!isBare);

  const signOut = (loginPath: string): void => {
    void (async (): Promise<void> => {
      try {
        await logoutStaff();
      } catch {
        // Cookie/local session still cleared below.
      }
      await clearStaffSession();
      router.replace(loginPath);
      router.refresh();
    })();
  };
  const onLogout = (): void => signOut('/login');
  // S-11: no activity for 30 minutes (in any tab) ends the session.
  useIdleLogout({ enabled: !isBare, onIdle: (): void => signOut('/login?reason=idle') });

  if (isBare) {
    return <>{children}</>;
  }

  const railWidth = collapsed ? SIDEBAR_RAIL_WIDTH : SIDEBAR_WIDTH;

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          display: { md: 'none' },
          bgcolor: 'primary.dark',
          color: 'primary.contrastText',
          // Notch / landscape cut-outs: keep the bar content out of the unsafe areas.
          pt: 'env(safe-area-inset-top)',
          pl: 'env(safe-area-inset-left)',
          pr: 'env(safe-area-inset-right)',
        }}
        data-print="hide"
      >
        <Toolbar sx={{ minHeight: `${String(MOBILE_BAR_HEIGHT)}px` }}>
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
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': {
            width: SIDEBAR_WIDTH,
            maxWidth: '86vw',
            border: 0,
            // The sidebar's own padding plus the home-indicator / notch insets.
            pt: 'env(safe-area-inset-top)',
            pb: 'env(safe-area-inset-bottom)',
          },
        }}
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
          overflowX: 'auto',
          px: {
            xs: 'max(16px, env(safe-area-inset-left))',
            sm: 'max(24px, env(safe-area-inset-left))',
            md: 6,
          },
          pr: { xs: 'max(16px, env(safe-area-inset-right))', sm: 'max(24px, env(safe-area-inset-right))' },
          py: { xs: 2.5, md: 5 },
          pb: { xs: 'calc(24px + env(safe-area-inset-bottom))', md: 5 },
          mt: { xs: `calc(${String(MOBILE_BAR_HEIGHT)}px + env(safe-area-inset-top))`, md: 0 },
          maxWidth: 1360,
        }}
      >
        <BlurFade inView={false}>{children}</BlurFade>
      </Box>
    </Box>
  );
}

/**
 * @file apps/admin/src/shared/components/staff-sidebar.tsx
 * @shared The staff sidebar: brand, grouped navigation, collapse, signed-in user
 * @dependencies MUI, nav-config, sidebar-link, user-avatar
 */

import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import { Box, Button, IconButton, List, Stack, Tooltip, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import type { StaffProfile } from '@resort-booking/shared-types';
import Link from 'next/link';
import { isNavActive } from './nav-match';
import { NAV_GROUPS, type NavItem } from './nav-config';
import { SidebarLink } from './sidebar-link';
import { UserAvatar } from './user-avatar';

export const SIDEBAR_WIDTH = 272;
export const SIDEBAR_RAIL_WIDTH = 80;

interface StaffSidebarProps {
  pathname: string;
  collapsed: boolean;
  /** Present on desktop only; the mobile drawer is always full width. */
  onToggleCollapsed?: () => void;
  profile: StaffProfile | null;
  refundsWaiting: number;
  onLogout: () => void;
  onNavigate?: () => void;
}

function ignore(): void {
  // Nothing to do after a click on desktop.
}

/**
 * Deep-teal sidebar. Groups carry small overline labels (hidden in the rail); the footer holds the
 * signed-in person and Sign out. Everything is reachable by keyboard and the current page is
 * announced with aria-current.
 */
export function StaffSidebar({
  pathname,
  collapsed,
  onToggleCollapsed,
  profile,
  refundsWaiting,
  onLogout,
  onNavigate = ignore,
}: StaffSidebarProps): React.JSX.Element {
  const name = profile?.fullName ?? 'Signed in';
  const badgeFor = (item: NavItem): number => (item.key === 'refunds' ? refundsWaiting : 0);

  return (
    <Box
      component="nav"
      aria-label="Main"
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        bgcolor: 'primary.dark',
        color: 'primary.contrastText',
        px: 1.5,
        py: 2,
      }}
    >
      <Box
        component={Link}
        href="/"
        onClick={onNavigate}
        aria-label="Humphreys staff home"
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.5,
          px: 1,
          py: 1,
          mb: 2,
          color: 'inherit',
          textDecoration: 'none',
          borderRadius: 2,
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}
      >
        <Box
          aria-hidden
          sx={{
            width: 40,
            height: 40,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 2,
            bgcolor: 'secondary.main',
            color: 'secondary.contrastText',
            fontWeight: 800,
            fontSize: 22,
          }}
        >
          H
        </Box>
        {collapsed ? null : (
          <Box>
            <Typography variant="subtitle1" sx={{ lineHeight: 1.2, fontWeight: 700 }}>
              Humphreys
            </Typography>
            <Typography variant="overline" sx={{ lineHeight: 1.4, opacity: 0.8 }}>
              Staff
            </Typography>
          </Box>
        )}
      </Box>

      <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
        {NAV_GROUPS.map((group): React.JSX.Element => (
          <Box key={group.label} component="section" aria-label={group.label} sx={{ mb: 2 }}>
            {collapsed ? (
              <Box sx={{ mx: 1.5, mb: 1, borderTop: 1, borderColor: (theme): string => alpha(theme.palette.primary.contrastText, 0.18) }} />
            ) : (
              <Typography variant="overline" sx={{ display: 'block', px: 1.5, mb: 0.5, opacity: 0.7 }}>
                {group.label}
              </Typography>
            )}
            <List disablePadding>
              {group.items.map((item): React.JSX.Element => (
                <SidebarLink
                  key={item.key}
                  item={item}
                  active={isNavActive(item.href, pathname)}
                  collapsed={collapsed}
                  badgeCount={badgeFor(item)}
                  onNavigate={onNavigate}
                />
              ))}
            </List>
          </Box>
        ))}
      </Box>

      {onToggleCollapsed === undefined ? null : (
        <Tooltip title={collapsed ? 'Expand sidebar' : ''} placement="right" arrow>
          <Button
            color="inherit"
            size="small"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            onClick={onToggleCollapsed}
            startIcon={collapsed ? undefined : <ChevronLeftIcon />}
            sx={{ mb: 1.5, justifyContent: collapsed ? 'center' : 'flex-start', opacity: 0.8, minWidth: 0 }}
          >
            {collapsed ? <ChevronRightIcon /> : 'Collapse'}
          </Button>
        </Tooltip>
      )}

      <Box
        sx={{
          pt: 2,
          borderTop: 1,
          borderColor: (theme): string => alpha(theme.palette.primary.contrastText, 0.18),
        }}
      >
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ px: 0.5, justifyContent: collapsed ? 'center' : 'flex-start' }}>
          <UserAvatar name={name} size={40} />
          {collapsed ? null : (
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                {name}
              </Typography>
              <Typography variant="caption" sx={{ display: 'block', opacity: 0.8 }} noWrap>
                {profile?.email ?? ''}
              </Typography>
            </Box>
          )}
        </Stack>
        {collapsed ? (
          <Tooltip title="Sign out" placement="right" arrow>
            <IconButton color="inherit" aria-label="Sign out" onClick={onLogout} sx={{ mt: 1.5, mx: 'auto', display: 'flex' }}>
              <LogoutOutlinedIcon />
            </IconButton>
          </Tooltip>
        ) : (
          <Button
            fullWidth
            color="inherit"
            variant="outlined"
            startIcon={<LogoutOutlinedIcon />}
            onClick={onLogout}
            sx={{ mt: 1.5, borderColor: (theme): string => alpha(theme.palette.primary.contrastText, 0.4) }}
          >
            Sign out
          </Button>
        )}
      </Box>
    </Box>
  );
}

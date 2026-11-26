/**
 * @file apps/admin/src/shared/components/sidebar-link.tsx
 * @shared One sidebar item: icon (outlined idle, filled active), label, hint, optional badge
 * @dependencies MUI, next/link
 */

import { Badge, Box, ListItemButton, Tooltip, Typography } from '@mui/material';
import { alpha } from '@mui/material/styles';
import Link from 'next/link';
import { VISUALLY_HIDDEN } from '../utils/visually-hidden';
import type { NavItem } from './nav-config';

interface SidebarLinkProps {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  /** How many things wait on this page (shown as a badge and read out by screen readers). */
  badgeCount?: number;
  onNavigate?: () => void;
}

/**
 * A link on the deep primary sidebar. The active page gets a tinted pill, a bright left bar, a
 * bold label and a filled icon, and `aria-current="page"` for assistive tech. In the icon-only
 * rail a tooltip carries the label and hint.
 */
function ignore(): void {
  // Nothing to do after a click on desktop.
}

export function SidebarLink({ item, active, collapsed, badgeCount = 0, onNavigate = ignore }: SidebarLinkProps): React.JSX.Element {
  return (
    <Tooltip title={collapsed ? `${item.label} · ${item.hint}` : ''} placement="right" arrow>
      <ListItemButton
        component={Link}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        onClick={onNavigate}
        sx={{
          position: 'relative',
          mb: 0.5,
          py: 1,
          px: 1.5,
          gap: 1.5,
          borderRadius: 2,
          justifyContent: collapsed ? 'center' : 'flex-start',
          color: (theme): string =>
            active ? theme.palette.primary.contrastText : alpha(theme.palette.primary.contrastText, 0.72),
          bgcolor: (theme): string => (active ? alpha(theme.palette.primary.contrastText, 0.14) : 'transparent'),
          '&:hover': {
            color: 'primary.contrastText',
            bgcolor: (theme): string => alpha(theme.palette.primary.contrastText, active ? 0.18 : 0.08),
          },
          '&::before': {
            content: '""',
            position: 'absolute',
            left: 0,
            top: 8,
            bottom: 8,
            width: 3,
            borderRadius: 3,
            bgcolor: 'secondary.light',
            opacity: active ? 1 : 0,
          },
          '&.Mui-focusVisible': { outline: 2, outlineStyle: 'solid', outlineColor: 'secondary.light', outlineOffset: -2 },
        }}
      >
        <Badge badgeContent={badgeCount} max={99} color="secondary" overlap="circular">
          <Box component="span" sx={{ display: 'inline-flex', '& svg': { fontSize: 24 } }}>
            {active ? item.activeIcon : item.idleIcon}
          </Box>
        </Badge>
        {collapsed ? (
          <Box component="span" sx={VISUALLY_HIDDEN}>
            {item.label}
            {badgeCount > 0 ? `, ${String(badgeCount)} waiting` : ''}
          </Box>
        ) : (
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="body1" sx={{ fontWeight: active ? 700 : 500, lineHeight: 1.3 }}>
              {item.label}
              {badgeCount > 0 ? <Box component="span" sx={VISUALLY_HIDDEN}>{`, ${String(badgeCount)} waiting`}</Box> : null}
            </Typography>
            <Typography variant="caption" sx={{ display: 'block', opacity: 0.8, lineHeight: 1.3 }} noWrap>
              {item.hint}
            </Typography>
          </Box>
        )}
      </ListItemButton>
    </Tooltip>
  );
}

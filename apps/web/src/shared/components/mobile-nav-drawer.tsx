/**
 * @file apps/web/src/shared/components/mobile-nav-drawer.tsx
 * @shared Header menu for phones: one 44px button that opens the three links in a drawer
 * @dependencies @mui/material, guest-anchor-link
 */

'use client';

import CloseIcon from '@mui/icons-material/Close';
import HolidayVillageOutlinedIcon from '@mui/icons-material/HolidayVillageOutlined';
import ManageSearchOutlinedIcon from '@mui/icons-material/ManageSearchOutlined';
import MenuIcon from '@mui/icons-material/Menu';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import { Box, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Typography } from '@mui/material';
import NextLink from 'next/link';
import { useState } from 'react';
import { GuestAnchorLink } from './guest-anchor-link';

/**
 * Menu button shown only below the `sm` breakpoint (the full links show above it). The drawer opens
 * from the right, every row is at least 52px tall, and it clears the phone's safe areas.
 */
export function MobileNavDrawer(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const close = (): void => setOpen(false);
  return (
    <Box sx={{ display: { xs: 'block', sm: 'none' } }}>
      <IconButton aria-label="Open menu" aria-haspopup="dialog" edge="end" onClick={(): void => setOpen(true)}>
        <MenuIcon />
      </IconButton>
      <Drawer
        anchor="right"
        open={open}
        onClose={close}
        slotProps={{
          paper: {
            sx: {
              width: 'min(320px, 85vw)',
              pt: 'env(safe-area-inset-top)',
              pb: 'env(safe-area-inset-bottom)',
              pr: 'env(safe-area-inset-right)',
            },
          },
        }}
      >
        <Box component="nav" aria-label="Main menu">
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, minHeight: 64 }}>
            <Typography variant="h6" component="span">
              Menu
            </Typography>
            <IconButton aria-label="Close menu" edge="end" onClick={close}>
              <CloseIcon />
            </IconButton>
          </Box>
          <List disablePadding>
            <ListItemButton component={NextLink} href="/properties" onClick={close} sx={{ minHeight: 52 }}>
              <ListItemIcon sx={{ minWidth: 40 }}>
                <HolidayVillageOutlinedIcon />
              </ListItemIcon>
              <ListItemText primary="Properties" />
            </ListItemButton>
            <ListItemButton component={NextLink} href="/manage" onClick={close} sx={{ minHeight: 52 }}>
              <ListItemIcon sx={{ minWidth: 40 }}>
                <ManageSearchOutlinedIcon />
              </ListItemIcon>
              <ListItemText primary="Manage booking" />
            </ListItemButton>
            <Box sx={{ px: 2, pt: 1.5 }}>
              <GuestAnchorLink hash="search" color="primary.main" fontWeight={600} onNavigate={close}>
                <SearchOutlinedIcon fontSize="small" />
                Search stays
              </GuestAnchorLink>
            </Box>
          </List>
        </Box>
      </Drawer>
    </Box>
  );
}

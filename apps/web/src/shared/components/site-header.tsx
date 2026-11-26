/**
 * @file apps/web/src/shared/components/site-header.tsx
 * @shared Guest chrome
 * @dependencies @mui/material, Magic UI
 */

'use client';

import HolidayVillageOutlinedIcon from '@mui/icons-material/HolidayVillageOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import { AppBar, Box, Container, Link as MuiLink, Toolbar, Typography } from '@mui/material';
import { SparklesText } from '@resort-booking/ui';
import NextLink from 'next/link';
import { GuestAnchorLink, GuestHashScroller } from './guest-anchor-link';
import { MobileNavDrawer } from './mobile-nav-drawer';

/**
 * Guest header. Own wordmark — not an Airbnb clone.
 */
export function SiteHeader(): React.JSX.Element {
  return (
    <AppBar
      position="sticky"
      elevation={0}
      color="inherit"
      sx={{
        borderBottom: 1,
        borderColor: 'divider',
        bgcolor: 'background.paper',
        backgroundImage: (theme) =>
          `linear-gradient(180deg, ${theme.palette.secondary.main}14 0%, transparent 100%)`,
        backdropFilter: 'blur(12px)',
        // Phone notches: keep the bar's content below the status bar when the page is edge to edge.
        pt: 'env(safe-area-inset-top)',
      }}
    >
      <GuestHashScroller />
      <Container>
        <Toolbar disableGutters sx={{ minHeight: { xs: 64, md: 80 } }}>
          <MuiLink
            component={NextLink}
            href="/"
            underline="none"
            color="text.primary"
            sx={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 44 }}
          >
            <SparklesText variant="h6" component="span">
              Humphreys
            </SparklesText>
            <Typography variant="caption" color="text.secondary" sx={{ letterSpacing: 0.4 }}>
              Direct booking
            </Typography>
          </MuiLink>
          <Box sx={{ flexGrow: 1 }} />
          <Box sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center' }}>
            <MuiLink
              component={NextLink}
              href="/properties"
              underline="hover"
              color="text.secondary"
              sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, minHeight: { xs: 44, md: 'auto' } }}
            >
              <HolidayVillageOutlinedIcon fontSize="small" />
              Properties
            </MuiLink>
            <Box sx={{ width: 24 }} />
            <MuiLink
              component={NextLink}
              href="/manage"
              underline="hover"
              color="text.secondary"
              sx={{ display: 'inline-flex', alignItems: 'center', minHeight: { xs: 44, md: 'auto' } }}
            >
              Manage booking
            </MuiLink>
            <Box sx={{ width: 24 }} />
            <GuestAnchorLink hash="search" color="primary.main" fontWeight={600}>
              <SearchOutlinedIcon fontSize="small" />
              Search stays
            </GuestAnchorLink>
          </Box>
          <MobileNavDrawer />
        </Toolbar>
      </Container>
    </AppBar>
  );
}

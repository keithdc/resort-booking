/**
 * @file apps/web/src/app/not-found.tsx
 * @shared Guest 404
 * @dependencies @mui/material
 */

import { Box, Button, Container, Typography } from '@mui/material';
import NextLink from 'next/link';

/**
 * Shown for an unknown address or a property or stay that does not exist (or is not published).
 * Two clear ways forward, each a full-width 44px+ button on a phone.
 */
export default function NotFound(): React.JSX.Element {
  return (
    <Container maxWidth="sm" sx={{ py: { xs: 6, md: 10 } }}>
      <Typography variant="overline" color="text.secondary">
        404
      </Typography>
      <Typography variant="h3" component="h1" gutterBottom>
        We can&apos;t find that page
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 4 }}>
        The link may be old, or the stay is no longer listed. Start again from the home page or look at our properties.
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5 }}>
        <Button component={NextLink} href="/" variant="contained" size="large">
          Back to home
        </Button>
        <Button component={NextLink} href="/properties" variant="outlined" size="large">
          Our properties
        </Button>
      </Box>
    </Container>
  );
}

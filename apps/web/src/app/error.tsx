'use client';

/**
 * @file apps/web/src/app/error.tsx
 * @shared Route error
 * @dependencies @mui/material
 */

import { Button, Container, Typography } from '@mui/material';

interface ErrorPageProps {
  reset: () => void;
}

/**
 * Route-level error UI.
 */
export default function ErrorPage({ reset }: ErrorPageProps): React.JSX.Element {
  return (
    <Container maxWidth="sm" sx={{ py: { xs: 6, md: 8 } }} role="alert">
      <Typography variant="h5" component="h1" gutterBottom>
        Something went wrong
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        Nothing was charged. Try again, and if it keeps happening contact the property.
      </Typography>
      <Button variant="contained" size="large" onClick={reset} sx={{ width: { xs: '100%', sm: 'auto' } }}>
        Try again
      </Button>
    </Container>
  );
}

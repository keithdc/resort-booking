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
    <Container sx={{ py: 8 }}>
      <Typography variant="h5" gutterBottom>
        Something went wrong
      </Typography>
      <Button variant="contained" onClick={reset}>
        Try again
      </Button>
    </Container>
  );
}

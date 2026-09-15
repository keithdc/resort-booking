/**
 * @file apps/web/src/app/loading.tsx
 * @shared Route loading
 * @dependencies @mui/material
 */

import { CircularProgress, Container } from '@mui/material';

/**
 * Route-level loading spinner.
 */
export default function Loading(): React.JSX.Element {
  return (
    <Container sx={{ py: 8, display: 'flex', justifyContent: 'center' }}>
      <CircularProgress />
    </Container>
  );
}

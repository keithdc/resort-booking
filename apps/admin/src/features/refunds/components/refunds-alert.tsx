/**
 * @file apps/admin/src/features/refunds/components/refunds-alert.tsx
 * @feature refunds
 * @dependencies staff-refunds-api
 */

'use client';

import { Alert, Button } from '@mui/material';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchStaffRefunds } from '../services/staff-refunds-api';

/**
 * A quiet heads-up on the staff home page: "3 refunds need your attention", with a link. It never
 * blocks the page: if the count cannot be loaded, or nothing needs attention, it shows nothing.
 */
export function RefundsAlert(): React.JSX.Element | null {
  const [count, setCount] = useState(0);

  useEffect((): void => {
    fetchStaffRefunds('needs_attention', '')
      .then((refunds): void => setCount(refunds.length))
      .catch((): void => setCount(0));
  }, []);

  if (count === 0) {
    return null;
  }
  return (
    <Alert
      severity="warning"
      sx={{ mb: 3 }}
      action={
        <Button color="inherit" size="small" component={Link} href="/refunds">
          Open refunds
        </Button>
      }
    >
      {count} refund{count === 1 ? '' : 's'} need{count === 1 ? 's' : ''} your attention
    </Alert>
  );
}

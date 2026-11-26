/**
 * @file apps/admin/src/shared/components/not-allowed.tsx
 * @shared "Your role cannot open this page" notice (instead of a crash on the API's 403)
 * @dependencies MUI, empty-state, page-header
 */

import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { Button } from '@mui/material';
import Link from 'next/link';
import { EmptyState } from './empty-state';

interface NotAllowedProps {
  /** What the page is, e.g. "The team page". */
  what?: string;
}

/**
 * Friendly page for an employee who typed the address of an admin-only screen.
 */
export function NotAllowed({ what = 'This page' }: NotAllowedProps): React.JSX.Element {
  return (
    <EmptyState
      icon={<LockOutlinedIcon />}
      title="Only admins can open this page"
      hint={`${what} is for workspace admins. Ask an admin if you need something changed.`}
      action={
        <Button component={Link} href="/" variant="contained">
          Back to the calendar
        </Button>
      }
    />
  );
}

/**
 * @file apps/admin/src/features/configuration/components/account-summary.tsx
 * @feature configuration
 * @dependencies MUI, user avatar
 */

import BusinessOutlinedIcon from '@mui/icons-material/BusinessOutlined';
import MailOutlineIcon from '@mui/icons-material/MailOutline';
import { Chip, Paper, Stack, Typography } from '@mui/material';
import type { OrganizationSettings, StaffProfile } from '@resort-booking/shared-types';
import { UserAvatar } from '@/shared/components/user-avatar';

interface AccountSummaryProps {
  staff: StaffProfile;
  /** Null for an employee: the business settings are admin-only, so the business chip is left out. */
  org: OrganizationSettings | null;
}

/**
 * Who this account is, at a glance, above the forms.
 */
export function AccountSummary({ staff, org }: AccountSummaryProps): React.JSX.Element {
  return (
    <Paper component="section" aria-label="Signed-in account" elevation={1} sx={{ p: 2, borderRadius: 2, borderLeft: 6, borderColor: 'secondary.main' }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ sm: 'center' }}>
        <UserAvatar name={staff.fullName} size={52} />
        <Stack spacing={0.5}>
          <Typography variant="h6" component="p" sx={{ fontWeight: 700 }}>
            {staff.fullName}
          </Typography>
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            <Chip size="small" variant="outlined" icon={<MailOutlineIcon />} label={staff.email} />
            {org === null ? null : <Chip size="small" color="secondary" icon={<BusinessOutlinedIcon />} label={org.name} />}
          </Stack>
        </Stack>
      </Stack>
    </Paper>
  );
}

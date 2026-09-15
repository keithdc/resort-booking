/**
 * @file apps/admin/src/features/configuration/components/configuration-page.tsx
 * @feature configuration
 * @dependencies organization + owner account
 */

'use client';

import type { OrganizationSettings, StaffProfile } from '@resort-booking/shared-types';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import { Alert, Card, CardContent, CircularProgress, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { fetchStaffMe } from '@/features/identity/services/staff-identity-api';
import { fetchOrganizationSettings } from '@/features/property/services/staff-property-api';
import { ApiRequestError } from '@/shared/services/api-client';
import { OrganizationSettingsForm } from './organization-settings-form';
import { OwnerAccountForm } from './owner-account-form';

/**
 * Operator account in three cards: login, guest emails, legal and bank.
 */
export function ConfigurationPage(): React.JSX.Element {
  const [org, setOrg] = useState<OrganizationSettings | null>(null);
  const [staff, setStaff] = useState<StaffProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect((): (() => void) => {
    let cancelled = false;
    void Promise.all([fetchOrganizationSettings(), fetchStaffMe()])
      .then(([nextOrg, nextStaff]): void => {
        if (!cancelled) {
          setOrg(nextOrg);
          setStaff(nextStaff);
        }
      })
      .catch((err: unknown): void => {
        if (!cancelled) {
          setError(err instanceof ApiRequestError ? err.message : 'Could not load account');
        }
      });
    return (): void => {
      cancelled = true;
    };
  }, []);

  return (
    <Stack spacing={3} maxWidth={720}>
      <div>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
          <AccountCircleOutlinedIcon color="primary" />
          <Typography variant="h4" component="h1">
            Account
          </Typography>
        </Stack>
        <Typography color="text.secondary">
          Three short sections: how you sign in, where booking emails go, then legal and bank details
          for transfers. Refunds and extras stay on each property.
        </Typography>
      </div>
      {error !== null ? <Alert severity="error">{error}</Alert> : null}
      {staff === null || org === null ? (
        <CircularProgress />
      ) : (
        <>
          <Card>
            <CardContent>
              <Typography variant="overline" color="secondary.main">
                1 · Sign in
              </Typography>
              <Typography variant="h6" gutterBottom>
                Your staff login
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 2 }}>
                Name and email you use on this admin site. Change the password here if you need to.
              </Typography>
              <OwnerAccountForm initial={staff} />
            </CardContent>
          </Card>
          <OrganizationSettingsForm initial={org} />
        </>
      )}
    </Stack>
  );
}

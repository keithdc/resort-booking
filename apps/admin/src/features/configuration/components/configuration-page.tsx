/**
 * @file apps/admin/src/features/configuration/components/configuration-page.tsx
 * @feature configuration
 * @dependencies organization + owner account
 */

'use client';

import type { OrganizationSettings, StaffProfile } from '@resort-booking/shared-types';
import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import GavelOutlinedIcon from '@mui/icons-material/GavelOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import { Alert, Box, Button, Skeleton, Stack, Typography } from '@mui/material';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { fetchStaffMe } from '@/features/identity/services/staff-identity-api';
import { fetchOrganizationSettings } from '@/features/property/services/staff-property-api';
import { PageHeader } from '@/shared/components/page-header';
import { SectionCard } from '@/shared/components/section-card';
import { ApiRequestError } from '@/shared/services/api-client';
import { AccountSummary } from './account-summary';
import { OrganizationSettingsForm } from './organization-settings-form';
import { OwnerAccountForm } from './owner-account-form';

/**
 * Operator account in short sections: who is signed in, how you sign in, your business, guest
 * emails, and legal and bank details. Refunds and extras stay on each property.
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
    <Box sx={{ maxWidth: 960 }}>
      <PageHeader
        icon={<AccountCircleOutlinedIcon />}
        tone="secondary"
        title="Account"
        description="How you sign in, your business, where booking emails go, and the legal and bank details for transfers."
      />
      {error !== null ? <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert> : null}
      {staff === null || org === null ? (
        error === null ? (
          <Stack spacing={3} aria-busy="true" aria-label="Loading account">
            <Skeleton variant="rounded" height={120} />
            <Skeleton variant="rounded" height={260} />
          </Stack>
        ) : null
      ) : (
        <Stack spacing={3}>
          <AccountSummary staff={staff} org={org} />
          <SectionCard
            eyebrow="1 · Sign in"
            icon={<LockOutlinedIcon />}
            tone="primary"
            title="Your staff login"
            description="Name and email you use on this admin site. Change the password here if you need to."
          >
            <OwnerAccountForm initial={staff} />
          </SectionCard>
          <OrganizationSettingsForm initial={org} />
          <SectionCard
            icon={<GavelOutlinedIcon />}
            tone="warning"
            title="Cancellation, refunds and extras"
            description="These are set for each property, not here."
            action={
              <Button component={Link} href="/properties" variant="outlined">
                Open properties
              </Button>
            }
          >
            <Typography color="text.secondary">
              Open a property and use the tabs “If they cancel”, “Guest extras” and “Discounts” to change what guests are refunded,
              what they can add, and the offers they see.
            </Typography>
          </SectionCard>
        </Stack>
      )}
    </Box>
  );
}

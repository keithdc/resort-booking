/**
 * @file apps/admin/src/features/configuration/components/organization-settings-form.tsx
 * @feature configuration
 * @dependencies staff-property-api
 */

'use client';

import type { OrganizationSettings } from '@resort-booking/shared-types';
import { Alert, Button, Card, CardContent, Snackbar, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { ApiRequestError } from '@/shared/services/api-client';
import { saveOrganizationSettings } from '@/features/property/services/staff-property-api';

interface OrganizationSettingsFormProps {
  initial: OrganizationSettings;
}

/**
 * Org-wide legal identity and bank details for transfers.
 */
export function OrganizationSettingsForm({ initial }: OrganizationSettingsFormProps): React.JSX.Element {
  const [form, setForm] = useState<OrganizationSettings>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const onSave = async (): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      const next = await saveOrganizationSettings({
        name: form.name,
        legalName: form.legalName,
        legalAddress: form.legalAddress,
        vatNumber: form.vatNumber,
        iban: form.iban,
        bic: form.bic,
        bankAccountName: form.bankAccountName,
        contactEmail: form.contactEmail,
        contactPhone: form.contactPhone,
        ownerName: form.ownerName,
        bookingEmail: form.bookingEmail,
        guestReplyEmail: form.guestReplyEmail,
      });
      setForm(next);
      setSaved(true);
    } catch (err: unknown) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save organization');
    } finally {
      setPending(false);
    }
  };

  return (
    <Stack spacing={3}>
      {error !== null ? <Alert severity="error">{error}</Alert> : null}
      <Card>
        <CardContent>
          <Typography variant="overline" color="secondary.main">
            2 · Guest contact
          </Typography>
          <Typography variant="h6" gutterBottom>
            Emails and phone guests see
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Booking alerts go to the notification inbox. The reply email and phone appear on the public listing.
          </Typography>
          <Stack spacing={2}>
            <TextField
              label="Public operator name"
              helperText="Shown as the brand on the guest site."
              value={form.name}
              onChange={(event): void => {
                setForm((current): OrganizationSettings => ({ ...current, name: event.target.value }));
              }}
            />
            <TextField
              label="Owner name"
              value={form.ownerName}
              onChange={(event): void => {
                setForm((current): OrganizationSettings => ({ ...current, ownerName: event.target.value }));
              }}
            />
            <TextField
              label="Booking notifications email"
              type="email"
              helperText="New stays and bank-transfer receipts."
              value={form.bookingEmail}
              onChange={(event): void => {
                setForm((current): OrganizationSettings => ({ ...current, bookingEmail: event.target.value }));
              }}
            />
            <TextField
              label="Guest-facing reply email"
              type="email"
              helperText="Shown on listings and in booking emails."
              value={form.guestReplyEmail}
              onChange={(event): void => {
                setForm((current): OrganizationSettings => ({ ...current, guestReplyEmail: event.target.value }));
              }}
            />
            <TextField
              label="Ops email"
              type="email"
              helperText="Internal operations inbox."
              value={form.contactEmail}
              onChange={(event): void => {
                setForm((current): OrganizationSettings => ({ ...current, contactEmail: event.target.value }));
              }}
            />
            <TextField
              label="Ops phone"
              value={form.contactPhone}
              onChange={(event): void => {
                setForm((current): OrganizationSettings => ({ ...current, contactPhone: event.target.value }));
              }}
            />
          </Stack>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Typography variant="overline" color="secondary.main">
            3 · Legal and bank
          </Typography>
          <Typography variant="h6" gutterBottom>
            Transfer details
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 2 }}>
            Printed on bank-transfer instructions. Not shown on the guest homepage.
          </Typography>
          <Stack spacing={2}>
            <TextField
              label="Legal name"
              value={form.legalName}
              onChange={(event): void => {
                setForm((current): OrganizationSettings => ({ ...current, legalName: event.target.value }));
              }}
            />
            <TextField
              label="Legal address"
              value={form.legalAddress}
              onChange={(event): void => {
                setForm((current): OrganizationSettings => ({ ...current, legalAddress: event.target.value }));
              }}
            />
            <TextField
              label="VAT number"
              value={form.vatNumber}
              onChange={(event): void => {
                setForm((current): OrganizationSettings => ({ ...current, vatNumber: event.target.value }));
              }}
            />
            <TextField
              label="Account name"
              value={form.bankAccountName}
              onChange={(event): void => {
                setForm((current): OrganizationSettings => ({ ...current, bankAccountName: event.target.value }));
              }}
            />
            <TextField
              label="IBAN"
              value={form.iban}
              onChange={(event): void => {
                setForm((current): OrganizationSettings => ({ ...current, iban: event.target.value }));
              }}
            />
            <TextField
              label="BIC"
              value={form.bic}
              onChange={(event): void => {
                setForm((current): OrganizationSettings => ({ ...current, bic: event.target.value }));
              }}
            />
            <Button variant="contained" disabled={pending} onClick={(): void => void onSave()}>
              {pending ? 'Saving…' : 'Save business details'}
            </Button>
          </Stack>
        </CardContent>
      </Card>
      <Snackbar open={saved} autoHideDuration={3000} onClose={(): void => setSaved(false)}>
        <Alert severity="success" onClose={(): void => setSaved(false)}>
          Organization saved
        </Alert>
      </Snackbar>
    </Stack>
  );
}

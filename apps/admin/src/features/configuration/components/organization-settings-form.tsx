/**
 * @file apps/admin/src/features/configuration/components/organization-settings-form.tsx
 * @feature configuration
 * @dependencies staff-property-api
 */

'use client';

import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import AlternateEmailOutlinedIcon from '@mui/icons-material/AlternateEmailOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import type { OrganizationSettings } from '@resort-booking/shared-types';
import { Alert, Box, Snackbar, Stack, TextField } from '@mui/material';
import { EmailField, isValidEmail, isValidPhone, PhoneField } from '@resort-booking/ui/contact';
import { useState } from 'react';
import { saveOrganizationSettings } from '@/features/property/services/staff-property-api';
import { SectionCard } from '@/shared/components/section-card';
import { ApiRequestError } from '@/shared/services/api-client';
import { changesSensitiveFields, isFormDirty, organizationProblem } from '../utils/form-dirty';
import { ConfirmSensitiveChangeDialog } from './confirm-sensitive-change-dialog';
import { SaveBar } from './save-bar';

interface OrganizationSettingsFormProps {
  initial: OrganizationSettings;
}

const TWO_COLUMNS = { display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } } as const;

/**
 * Org-wide identity, the emails and phone guests see, and the legal and bank details for transfers:
 * three cards, one form, one sticky save bar.
 */
export function OrganizationSettingsForm({ initial }: OrganizationSettingsFormProps): React.JSX.Element {
  const [saved, setSaved] = useState<OrganizationSettings>(initial);
  const [form, setForm] = useState<OrganizationSettings>(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const set = (patch: Partial<OrganizationSettings>): void => {
    setForm((current): OrganizationSettings => ({ ...current, ...patch }));
  };

  // The phone is optional; the three inboxes are required. The API re-checks all of it.
  const emailsValid = isValidEmail(form.bookingEmail) && isValidEmail(form.guestReplyEmail) && isValidEmail(form.contactEmail);
  const phoneValid = form.contactPhone === '' || isValidPhone(form.contactPhone);
  const problem = organizationProblem({ emailsValid, phoneValid });

  /** Sends the form. Bank and email changes carry the password (and code) the person just typed; throws on a refusal. */
  const send = async (proof: { currentPassword: string; twoFactorCode?: string } | null): Promise<void> => {
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
      ...(proof === null ? {} : proof),
    });
    setSaved(next);
    setForm(next);
    setNotice(true);
  };

  const onSave = async (): Promise<void> => {
    if (changesSensitiveFields(saved, form)) {
      setConfirmOpen(true);
      return;
    }
    setPending(true);
    setError(null);
    try {
      await send(null);
    } catch (err: unknown) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not save organization');
    } finally {
      setPending(false);
    }
  };

  const onConfirmed = async (currentPassword: string, twoFactorCode: string | undefined): Promise<void> => {
    setError(null);
    await send({ currentPassword, ...(twoFactorCode === undefined ? {} : { twoFactorCode }) });
    setConfirmOpen(false);
  };

  return (
    <Stack spacing={3}>
      {error !== null ? <Alert severity="error">{error}</Alert> : null}
      <SectionCard
        eyebrow="2 · Your business"
        icon={<StorefrontOutlinedIcon />}
        tone="primary"
        title="Business name and owner"
        description="The brand guests see on the website, and who owns the account."
      >
        <Box sx={TWO_COLUMNS}>
          <TextField
            label="Public operator name"
            helperText="Shown as the brand on the guest site."
            value={form.name}
            onChange={(event): void => set({ name: event.target.value })}
          />
          <TextField label="Owner name" value={form.ownerName} onChange={(event): void => set({ ownerName: event.target.value })} />
        </Box>
      </SectionCard>
      <SectionCard
        eyebrow="3 · Guest emails"
        icon={<AlternateEmailOutlinedIcon />}
        tone="info"
        title="Emails and phone guests see"
        description="Booking alerts go to the notification inbox. The reply email and phone appear on the public listing."
      >
        <Box sx={TWO_COLUMNS}>
          <EmailField
            label="Booking notifications email"
            required
            helperText="New bookings and bank-transfer receipts."
            value={form.bookingEmail}
            onChange={(bookingEmail): void => set({ bookingEmail })}
          />
          <EmailField
            label="Guest-facing reply email"
            required
            helperText="Shown on listings and in booking emails."
            value={form.guestReplyEmail}
            onChange={(guestReplyEmail): void => set({ guestReplyEmail })}
          />
          <EmailField
            label="Ops email"
            required
            helperText="Internal operations inbox."
            value={form.contactEmail}
            onChange={(contactEmail): void => set({ contactEmail })}
          />
          <PhoneField label="Ops phone" value={form.contactPhone} onChange={(contactPhone): void => set({ contactPhone })} />
        </Box>
      </SectionCard>
      <SectionCard
        eyebrow="4 · Legal and bank"
        icon={<AccountBalanceOutlinedIcon />}
        tone="secondary"
        title="Transfer details"
        description="Printed on bank-transfer instructions. Not shown on the guest homepage."
      >
        <Box sx={TWO_COLUMNS}>
          <TextField label="Legal name" value={form.legalName} onChange={(event): void => set({ legalName: event.target.value })} />
          <TextField label="VAT number" value={form.vatNumber} onChange={(event): void => set({ vatNumber: event.target.value })} />
          <TextField
            label="Legal address"
            value={form.legalAddress}
            onChange={(event): void => set({ legalAddress: event.target.value })}
            sx={{ gridColumn: { md: '1 / -1' } }}
          />
          <TextField label="Account name" value={form.bankAccountName} onChange={(event): void => set({ bankAccountName: event.target.value })} />
          <TextField label="IBAN" value={form.iban} onChange={(event): void => set({ iban: event.target.value })} />
          <TextField label="BIC" value={form.bic} onChange={(event): void => set({ bic: event.target.value })} />
        </Box>
      </SectionCard>
      <SaveBar
        sticky
        dirty={isFormDirty(saved, form)}
        pending={pending}
        problem={problem}
        saveLabel="Save business details"
        onSave={(): void => void onSave()}
        onDiscard={(): void => setForm(saved)}
      />
      <ConfirmSensitiveChangeDialog open={confirmOpen} onConfirm={onConfirmed} onClose={(): void => setConfirmOpen(false)} />
      <Snackbar open={notice} autoHideDuration={3000} onClose={(): void => setNotice(false)}>
        <Alert severity="success" onClose={(): void => setNotice(false)}>
          Organization saved
        </Alert>
      </Snackbar>
    </Stack>
  );
}

/**
 * @file apps/admin/src/features/team/components/invite-dialog.tsx
 * @feature team
 * @dependencies MUI, @resort-booking/ui/contact, role-chip labels
 */

'use client';

import { Alert, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, FormControlLabel, MenuItem, Stack, TextField, Typography } from '@mui/material';
import { EmailField, isValidEmail } from '@resort-booking/ui/contact';
import type { CreateInviteRequest, StaffRole } from '@resort-booking/shared-types';
import { useState, type FormEvent } from 'react';
import { ROLE_LABELS } from '@/shared/components/role-chip';

interface InviteDialogProps {
  open: boolean;
  pending: boolean;
  /** Whether the server can email the link; without it there is no checkbox. */
  mailEnabled: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (request: CreateInviteRequest) => void;
}

const REFUND_ACCESS_HELP =
  'Lets them retry failed refunds, mark hand refunds as paid, mark pay-at-hotel bookings as paid, see revenue and money figures in Reports, choose any refund amount, waive the change fee and decide on the check-in day. Everything they do here is recorded in the audit log with their name.';

const ROLE_HINTS: Record<StaffRole, string> = {
  employee: 'Calendar, bookings and check-in. No money settings, no team. Refunds follow the policy unless you give them refund access.',
  admin: 'Everything, including the team, property settings, refunds and money.',
};

/**
 * Invite someone by email and role. The parent shows the one-time link when the call succeeds.
 */
export function InviteDialog({ open, pending, mailEnabled, error, onClose, onSubmit }: InviteDialogProps): React.JSX.Element {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<StaffRole>('employee');
  const [emailIt, setEmailIt] = useState(true);
  const [refundAccess, setRefundAccess] = useState(false);
  const canSubmit = !pending && isValidEmail(email) && fullName.trim().length >= 2;

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (canSubmit) {
      onSubmit({
        email: email.trim(),
        fullName: fullName.trim(),
        role,
        ...(role === 'employee' && refundAccess ? { canManageRefunds: true } : {}),
        ...(mailEnabled && emailIt ? { sendEmail: true } : {}),
      });
    }
  };
  const reset = (): void => {
    setEmail('');
    setFullName('');
    setRole('employee');
    setEmailIt(true);
    setRefundAccess(false);
  };

  return (
    <Dialog
      open={open}
      onClose={pending ? undefined : onClose}
      fullWidth
      maxWidth="sm"
      aria-labelledby="invite-title"
      slotProps={{ transition: { onExited: reset } }}
    >
      <form onSubmit={submit} noValidate>
        <DialogTitle id="invite-title">Invite a team member</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            {mailEnabled
              ? 'You always get a one-time link, and you can have us email it to them too.'
              : 'You get a one-time link to send them yourself. Email is not set up on this server.'}
          </DialogContentText>
          {error !== null ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField label="Name" required value={fullName} onChange={(event): void => setFullName(event.target.value)} autoComplete="off" slotProps={{ htmlInput: { maxLength: 120 } }} />
            <EmailField label="Email" required value={email} onChange={setEmail} autoComplete="off" />
            <TextField select label="Role" value={role} onChange={(event): void => setRole(event.target.value === 'admin' ? 'admin' : 'employee')} helperText={ROLE_HINTS[role]}>
              <MenuItem value="employee">{ROLE_LABELS.employee}</MenuItem>
              <MenuItem value="admin">{ROLE_LABELS.admin}</MenuItem>
            </TextField>
            {role === 'employee' ? (
              <FormControlLabel
                sx={{ alignItems: 'flex-start' }}
                control={<Checkbox checked={refundAccess} onChange={(event): void => setRefundAccess(event.target.checked)} />}
                label={
                  <>
                    <Typography component="span" display="block">
                      Can handle refunds and money actions
                    </Typography>
                    <Typography component="span" variant="body2" color="text.secondary" display="block">
                      {REFUND_ACCESS_HELP}
                    </Typography>
                  </>
                }
              />
            ) : null}
            {mailEnabled ? (
              <FormControlLabel
                control={<Checkbox checked={emailIt} onChange={(event): void => setEmailIt(event.target.checked)} />}
                label="Email the link to them"
              />
            ) : null}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={!canSubmit}>
            {pending ? 'Creating link…' : mailEnabled && emailIt ? 'Invite and email link' : 'Create invitation link'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

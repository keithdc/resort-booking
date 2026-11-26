/**
 * @file apps/admin/src/features/team/components/issued-link-dialog.tsx
 * @feature team
 * @dependencies MUI, team-messages (inviteUrl), format-time
 * The link is ALWAYS shown with a copy button, whatever happened to the email.
 */

'use client';

import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import CheckIcon from '@mui/icons-material/Check';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Stack, TextField } from '@mui/material';
import type { InviteIssued } from '@resort-booking/shared-types';
import { useState } from 'react';
import { formatDateTime } from '../utils/format-time';
import { inviteUrl } from '../utils/team-messages';

interface IssuedLinkDialogProps {
  /** The answer of the invite / reset call. Null closes the dialog (and the token is gone from memory). */
  issued: InviteIssued | null;
  /** "Invitation ready" or "Access reset". */
  title: string;
  /** Who the link is for, e.g. an email. */
  recipient: string;
  onClose: () => void;
}

/** What to tell the admin about the email they asked for. Null when they did not ask for one. */
export function emailNoticeFor(status: InviteIssued['emailStatus'], recipient: string): { severity: 'success' | 'warning' | 'info'; text: string } | null {
  switch (status) {
    case 'sent':
      return { severity: 'success', text: `Email sent to ${recipient}.` };
    case 'failed':
      return { severity: 'warning', text: 'We could not send the email. Copy the link below and send it yourself.' };
    case 'not_configured':
      return { severity: 'info', text: 'Email is not set up. Copy the link below and send it yourself.' };
    default:
      return null;
  }
}

/**
 * Shows the one-time link ONCE: the server never returns the token again. A copy button, a warning, and a
 * Done button that only says what is lost.
 */
export function IssuedLinkDialog({ issued, title, recipient, onClose }: IssuedLinkDialogProps): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const emailNotice = issued === null ? null : emailNoticeFor(issued.emailStatus, recipient);
  const link = issued === null ? '' : inviteUrl(window.location.origin, issued.inviteToken);

  const copy = (): void => {
    void navigator.clipboard
      .writeText(link)
      .then((): void => {
        setCopied(true);
        setCopyFailed(false);
      })
      .catch((): void => setCopyFailed(true));
  };
  const close = (): void => {
    setCopied(false);
    setCopyFailed(false);
    onClose();
  };

  return (
    <Dialog open={issued !== null} onClose={close} fullWidth maxWidth="sm" aria-labelledby="issued-link-title">
      <DialogTitle id="issued-link-title">{title}</DialogTitle>
      <DialogContent>
        {emailNotice !== null ? (
          <Alert severity={emailNotice.severity} sx={{ mb: 2 }}>
            {emailNotice.text}
          </Alert>
        ) : null}
        <DialogContentText sx={{ mb: 2 }}>
          {issued?.emailStatus === 'sent' ? 'You can also send' : 'Send'} this link to <strong>{recipient}</strong>. It works once
          {issued === null ? '' : ` and expires ${formatDateTime(issued.expiresAt)}`}.
        </DialogContentText>
        <Alert severity="warning" sx={{ mb: 2 }}>
          This is the only time you will see the link. We do not keep it. If you lose it, use a new link on the pending invitation (or reset access again).
        </Alert>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
          <TextField
            fullWidth
            label="One-time link"
            value={link}
            slotProps={{ input: { readOnly: true }, htmlInput: { 'aria-label': 'One-time link' } }}
          />
          <Button variant="contained" onClick={copy} startIcon={copied ? <CheckIcon /> : <ContentCopyOutlinedIcon />} sx={{ flexShrink: 0 }}>
            {copied ? 'Copied' : 'Copy link'}
          </Button>
        </Stack>
        {copyFailed ? (
          <Alert severity="info" sx={{ mt: 2 }}>
            Your browser blocked copying. Select the link above and copy it by hand.
          </Alert>
        ) : null}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={close}>Done</Button>
      </DialogActions>
    </Dialog>
  );
}

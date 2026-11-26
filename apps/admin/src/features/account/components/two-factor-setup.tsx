/**
 * @file apps/admin/src/features/account/components/two-factor-setup.tsx
 * @feature account
 * @dependencies staff-identity-api, clipboard utils, qr-code
 */

'use client';

import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import type { TwoFactorRecoveryCodes, TwoFactorSetup } from '@resort-booking/shared-types';
import { Alert, Box, Button, Collapse, IconButton, Stack, TextField, Tooltip, Typography } from '@mui/material';
import { useState } from 'react';
import { enableTwoFactor } from '@/features/identity/services/staff-identity-api';
import { ApiRequestError } from '@/shared/services/api-client';
import { copyText } from '../utils/clipboard';
import { QrCode } from './qr-code';

interface TwoFactorSetupPanelProps {
  setup: TwoFactorSetup;
  /** The password typed to start the setup: the server wants it again with the first code. Kept in memory only. */
  currentPassword: string;
  onEnabled: (result: TwoFactorRecoveryCodes) => void;
  onCancel: () => void;
}

interface CopyableProps {
  label: string;
  value: string;
}

/** A read-only line of text with a copy button (the secret and the otpauth link). */
function Copyable({ label, value }: CopyableProps): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" component="div">
        {label}
      </Typography>
      <Stack direction="row" spacing={1} alignItems="center">
        <Box
          component="code"
          data-testid={`copyable-${label}`}
          sx={{ flex: 1, minWidth: 0, p: 1, borderRadius: 1, border: 1, borderColor: 'divider', bgcolor: 'background.default', fontSize: 14, wordBreak: 'break-all' }}
        >
          {value}
        </Box>
        <Tooltip title={copied ? 'Copied' : `Copy ${label.toLowerCase()}`}>
          <IconButton
            aria-label={`Copy ${label.toLowerCase()}`}
            onClick={(): void => {
              void copyText(value).then(setCopied);
            }}
          >
            <ContentCopyOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>
    </Box>
  );
}

/**
 * Step two of turning two-step verification on: a QR code to scan (the key as text is the fallback), then one code from the app to
 * prove it works. The password typed at the start is sent again with the code. Nothing is protected until the code is accepted.
 */
export function TwoFactorSetupPanel({ setup, currentPassword, onEnabled, onCancel }: TwoFactorSetupPanelProps): React.JSX.Element {
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLink, setShowLink] = useState(false);

  const onConfirm = async (): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      onEnabled(await enableTwoFactor(currentPassword, code.trim()));
    } catch (err: unknown) {
      setError(
        err instanceof ApiRequestError && err.code === 'STAFF_PASSWORD_MISMATCH'
          ? 'Your password was not accepted. Cancel and start again.'
          : err instanceof ApiRequestError
            ? err.message
            : 'Could not turn on two-step verification',
      );
      setCode('');
    } finally {
      setPending(false);
    }
  };

  return (
    <Stack spacing={2}>
      <Typography color="text.secondary">Scan this QR code with your authenticator app, then enter the 6-digit code.</Typography>
      <QrCode value={setup.otpauthUri} label="QR code for your authenticator app" />
      <Typography variant="body2" color="text.secondary">
        Can&apos;t scan? Enter this key in your authenticator app instead.
      </Typography>
      <Copyable label="Setup key" value={setup.secret} />
      <Box>
        <Button
          size="small"
          aria-expanded={showLink}
          aria-controls="two-factor-setup-link"
          onClick={(): void => setShowLink((shown) => !shown)}
        >
          {showLink ? 'Hide setup link' : 'Show setup link'}
        </Button>
        <Collapse in={showLink} unmountOnExit id="two-factor-setup-link">
          <Box sx={{ pt: 1 }}>
            <Copyable label="Setup link" value={setup.otpauthUri} />
          </Box>
        </Collapse>
      </Box>
      {error !== null ? <Alert severity="error">{error}</Alert> : null}
      <Stack
        component="form"
        direction={{ xs: 'column', sm: 'row' }}
        spacing={2}
        alignItems={{ sm: 'flex-start' }}
        onSubmit={(event): void => {
          event.preventDefault();
          void onConfirm();
        }}
      >
        <TextField
          label="6-digit code"
          value={code}
          onChange={(event): void => setCode(event.target.value)}
          autoComplete="one-time-code"
          slotProps={{ htmlInput: { inputMode: 'numeric', maxLength: 7 } }}
          sx={{ maxWidth: 220 }}
        />
        <Button type="submit" variant="contained" disabled={pending || code.replace(/\s/g, '').length !== 6} sx={{ height: 56 }}>
          {pending ? 'Checking…' : 'Confirm and turn on'}
        </Button>
        <Button type="button" onClick={onCancel} disabled={pending} sx={{ height: 56 }}>
          Cancel
        </Button>
      </Stack>
    </Stack>
  );
}

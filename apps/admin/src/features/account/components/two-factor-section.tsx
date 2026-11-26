/**
 * @file apps/admin/src/features/account/components/two-factor-section.tsx
 * @feature account
 * @dependencies staff-identity-api, TwoFactorSetupPanel, RecoveryCodesPanel, TwoFactorConfirmDialog
 */

'use client';

import type { TwoFactorRecoveryCodes, TwoFactorSetup, TwoFactorStatus } from '@resort-booking/shared-types';
import { Alert, Box, Button, Chip, Skeleton, Snackbar, Stack, Typography } from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import {
  disableTwoFactor,
  fetchTwoFactorStatus,
  regenerateRecoveryCodes,
  startTwoFactorSetup,
} from '@/features/identity/services/staff-identity-api';
import { ApiRequestError } from '@/shared/services/api-client';
import { RecoveryCodesPanel } from './recovery-codes-panel';
import { TwoFactorConfirmDialog } from './two-factor-confirm-dialog';
import { TwoFactorSetupPanel } from './two-factor-setup';

/** Warn when this few recovery codes are left. */
const LOW_RECOVERY_CODES = 3;

type Dialog = 'disable' | 'regenerate' | null;

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Optional two-step verification (authenticator app) for the signed-in person: status, setup with a copyable key,
 * recovery codes shown once, and turning it off or replacing the codes with password and code.
 */
export function TwoFactorSection(): React.JSX.Element {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [setup, setSetup] = useState<TwoFactorSetup | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    try {
      setStatus(await fetchTwoFactorStatus());
    } catch (err: unknown) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load two-step verification');
    }
  }, []);

  useEffect((): void => {
    void load();
  }, [load]);

  const onStart = async (): Promise<void> => {
    setStarting(true);
    setError(null);
    try {
      setSetup(await startTwoFactorSetup());
    } catch (err: unknown) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not start the setup');
    } finally {
      setStarting(false);
    }
  };

  const onEnabled = (result: TwoFactorRecoveryCodes): void => {
    setSetup(null);
    setCodes(result.recoveryCodes);
    void load();
  };

  const onDisable = async (currentPassword: string, code: string): Promise<void> => {
    await disableTwoFactor({ currentPassword, code });
    setDialog(null);
    setNotice('Two-step verification is off');
    await load();
  };

  const onRegenerate = async (currentPassword: string, code: string): Promise<void> => {
    const result = await regenerateRecoveryCodes({ currentPassword, code });
    setDialog(null);
    setCodes(result.recoveryCodes);
    await load();
  };

  return (
    <Stack spacing={2} aria-label="Two-step verification">
      <Stack direction="row" spacing={1.5} alignItems="center">
        <Typography variant="h6" component="h3">
          Two-step verification
        </Typography>
        {status !== null ? (
          <Chip size="small" color={status.enabled ? 'success' : 'default'} label={status.enabled ? 'On' : 'Off'} />
        ) : null}
      </Stack>
      {error !== null ? <Alert severity="error">{error}</Alert> : null}
      {status === null && error === null ? <Skeleton variant="rounded" height={56} aria-label="Loading two-step verification" /> : null}

      {codes !== null ? (
        <RecoveryCodesPanel
          codes={codes}
          onDone={(): void => {
            setCodes(null);
            setNotice('Recovery codes saved');
          }}
        />
      ) : setup !== null ? (
        <TwoFactorSetupPanel setup={setup} onEnabled={onEnabled} onCancel={(): void => setSetup(null)} />
      ) : status !== null && !status.enabled ? (
        <>
          <Typography color="text.secondary">
            Add a second step to signing in: a 6-digit code from an authenticator app on your phone. It is optional, and you can turn it
            off at any time.
          </Typography>
          <Box>
            <Button variant="outlined" disabled={starting} onClick={(): void => void onStart()}>
              {starting ? 'Starting…' : 'Turn on two-step verification'}
            </Button>
          </Box>
        </>
      ) : status !== null ? (
        <>
          <Typography color="text.secondary">
            {status.enabledAt === null ? 'On.' : `On since ${formatDate(status.enabledAt)}.`} Signing in asks for a code from your authenticator
            app after your password.
          </Typography>
          <Typography variant="body2" color={status.recoveryCodesRemaining <= LOW_RECOVERY_CODES ? 'warning.main' : 'text.secondary'}>
            {status.recoveryCodesRemaining === 1 ? '1 recovery code left' : `${String(status.recoveryCodesRemaining)} recovery codes left`}
            {status.recoveryCodesRemaining <= LOW_RECOVERY_CODES ? '. Get new ones before you run out.' : '.'}
          </Typography>
          <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
            <Button variant="outlined" onClick={(): void => setDialog('regenerate')}>
              Get new recovery codes
            </Button>
            <Button variant="outlined" color="error" onClick={(): void => setDialog('disable')}>
              Turn off
            </Button>
          </Stack>
        </>
      ) : null}

      <TwoFactorConfirmDialog
        open={dialog === 'disable'}
        title="Turn off two-step verification?"
        description="Signing in will need only your password again. Enter your password and a current code (or a recovery code) to confirm."
        confirmLabel="Turn off"
        destructive
        onConfirm={onDisable}
        onClose={(): void => setDialog(null)}
      />
      <TwoFactorConfirmDialog
        open={dialog === 'regenerate'}
        title="Get new recovery codes"
        description="Your old recovery codes stop working as soon as new ones are made. Enter your password and a current code to continue."
        confirmLabel="Get new codes"
        onConfirm={onRegenerate}
        onClose={(): void => setDialog(null)}
      />
      <Snackbar open={notice !== null} autoHideDuration={3000} onClose={(): void => setNotice(null)}>
        <Alert severity="success" onClose={(): void => setNotice(null)}>
          {notice}
        </Alert>
      </Snackbar>
    </Stack>
  );
}

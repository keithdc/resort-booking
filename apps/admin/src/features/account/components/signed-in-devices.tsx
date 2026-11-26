/**
 * @file apps/admin/src/features/account/components/signed-in-devices.tsx
 * @feature account
 * @dependencies signed-in-devices-api, ConfirmDialog, device-time
 */

'use client';

import type { StaffSessionInfo } from '@resort-booking/shared-types';
import DevicesOutlinedIcon from '@mui/icons-material/DevicesOutlined';
import { Alert, Box, Button, Chip, Paper, Skeleton, Snackbar, Stack, Typography } from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { ApiRequestError } from '@/shared/services/api-client';
import { fetchSignedInDevices, signOutDevice, signOutOtherDevices } from '../services/signed-in-devices-api';
import { describeLastActive, describeSignedIn } from '../utils/device-time';

type Confirming = { kind: 'one'; session: StaffSessionInfo } | { kind: 'others' } | null;

interface DeviceCardProps {
  session: StaffSessionInfo;
  onSignOut: (session: StaffSessionInfo) => void;
}

/** One device as a card: stacks its text and button on a phone, sits in a row on a wider screen. */
function DeviceCard({ session, onSignOut }: DeviceCardProps): React.JSX.Element {
  return (
    <Paper
      variant="outlined"
      component="li"
      sx={{ p: 2, listStyle: 'none', display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5, alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
    >
      <Stack spacing={0.5} sx={{ minWidth: 0 }}>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
          <Typography component="span" sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
            {session.deviceLabel}
          </Typography>
          {session.current ? <Chip size="small" color="primary" label="This device" /> : null}
        </Stack>
        <Typography variant="body2" color="text.secondary">
          Last active: {describeLastActive(session.lastUsedAt)}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Signed in: {describeSignedIn(session.createdAt)}
        </Typography>
      </Stack>
      {session.current ? null : (
        <Button
          variant="outlined"
          color="error"
          onClick={(): void => onSignOut(session)}
          aria-label={`Sign out ${session.deviceLabel}`}
          sx={{ alignSelf: { xs: 'stretch', sm: 'center' }, flexShrink: 0 }}
        >
          Sign out
        </Button>
      )}
    </Paper>
  );
}

/**
 * "Signed-in devices": the person's own sessions with a coarse device label, last activity, a Sign out per device and
 * "Sign out all other devices". The server only ever lists and revokes the caller's own sessions (docs/13 R2-08).
 */
export function SignedInDevices(): React.JSX.Element {
  const [sessions, setSessions] = useState<StaffSessionInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [pending, setPending] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      setSessions(await fetchSignedInDevices());
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof ApiRequestError ? err.message : 'Could not load your signed-in devices');
    }
  }, []);

  useEffect((): void => {
    void load();
  }, [load]);

  const closeDialog = (): void => {
    setConfirming(null);
    setDialogError(null);
  };

  const confirm = async (): Promise<void> => {
    if (confirming === null) {
      return;
    }
    setPending(true);
    setDialogError(null);
    try {
      if (confirming.kind === 'one') {
        await signOutDevice(confirming.session.id);
        setNotice('Device signed out');
      } else {
        const result = await signOutOtherDevices();
        setNotice(result.sessionsEnded === 1 ? '1 other device signed out' : `${String(result.sessionsEnded)} other devices signed out`);
      }
      setConfirming(null);
      await load();
    } catch (err: unknown) {
      setDialogError(err instanceof ApiRequestError ? err.message : 'Something went wrong. Try again.');
    } finally {
      setPending(false);
    }
  };

  const others = sessions?.filter((session: StaffSessionInfo): boolean => !session.current) ?? [];

  return (
    <Stack spacing={2} aria-label="Signed-in devices">
      <Stack direction="row" spacing={1.5} alignItems="center">
        <DevicesOutlinedIcon color="action" />
        <Typography variant="h6" component="h3">
          Signed-in devices
        </Typography>
      </Stack>
      <Typography color="text.secondary">
        Where your account is signed in right now. Sign out any device you do not recognise or no longer use; you can sign in there again
        with your password.
      </Typography>
      {error !== null ? <Alert severity="error">{error}</Alert> : null}
      {sessions === null && error === null ? <Skeleton variant="rounded" height={88} aria-label="Loading signed-in devices" /> : null}
      {sessions !== null && sessions.length === 0 ? <Alert severity="info">No signed-in devices found.</Alert> : null}
      {sessions !== null && sessions.length > 0 ? (
        <Stack component="ul" spacing={1.5} sx={{ m: 0, p: 0 }}>
          {sessions.map(
            (session: StaffSessionInfo): React.JSX.Element => (
              <DeviceCard key={session.id} session={session} onSignOut={(target: StaffSessionInfo): void => setConfirming({ kind: 'one', session: target })} />
            ),
          )}
        </Stack>
      ) : null}
      {sessions !== null ? (
        <Box>
          <Button
            variant="outlined"
            color="error"
            disabled={others.length === 0}
            onClick={(): void => setConfirming({ kind: 'others' })}
            sx={{ width: { xs: '100%', sm: 'auto' } }}
          >
            Sign out all other devices
          </Button>
        </Box>
      ) : null}

      <ConfirmDialog
        open={confirming !== null}
        title={confirming?.kind === 'one' ? `Sign out ${confirming.session.deviceLabel}?` : 'Sign out all other devices?'}
        confirmLabel="Sign out"
        destructive
        pending={pending}
        error={dialogError}
        onConfirm={(): void => void confirm()}
        onClose={closeDialog}
      >
        {confirming?.kind === 'one'
          ? 'That device will need your password again the next time it is used.'
          : 'Every device except this one will need your password again. This device stays signed in.'}
      </ConfirmDialog>
      <Snackbar open={notice !== null} autoHideDuration={3000} onClose={(): void => setNotice(null)}>
        <Alert severity="success" onClose={(): void => setNotice(null)}>
          {notice}
        </Alert>
      </Snackbar>
    </Stack>
  );
}

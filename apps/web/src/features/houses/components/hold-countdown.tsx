/**
 * @file apps/web/src/features/houses/components/hold-countdown.tsx
 * @feature houses
 * @dependencies hold-countdown utils — every number comes from the API's hold
 */

import { Alert, Box, Button, LinearProgress, Stack, Typography } from '@mui/material';
import { formatClock, formatHoldDuration, holdProgressPercent } from '../utils/hold-countdown';

interface HoldCountdownProps {
  /** The whole length of the hold, from the API (`holdTtlSeconds`). */
  totalSeconds: number;
  remainingSeconds: number;
  /** The length of the "running out" window, from the API's warning time to the expiry. */
  warningSeconds: number;
  /** The API's warning moment has passed. */
  warning: boolean;
  expired: boolean;
  reserving: boolean;
  onHoldAgain: () => void;
}

/**
 * Shown only once the guest has pressed Pay and the API holds the dates. Says how long the
 * dates are held, counts down, and warns calmly when time is running out. When time runs out the
 * form keeps everything the guest typed and offers "Hold the dates again".
 */
export function HoldCountdown({
  totalSeconds,
  remainingSeconds,
  warningSeconds,
  warning,
  expired,
  reserving,
  onHoldAgain,
}: HoldCountdownProps): React.JSX.Element {
  if (expired) {
    return (
      <Alert
        severity="warning"
        action={
          <Button color="inherit" size="small" disabled={reserving} onClick={onHoldAgain}>
            {reserving ? 'Holding your dates…' : 'Hold the dates again'}
          </Button>
        }
      >
        Time ran out — your details are still here.
      </Alert>
    );
  }
  return (
    <Stack spacing={1} aria-label="Hold countdown">
      <Typography>We are holding these dates for you for {formatHoldDuration(totalSeconds)}.</Typography>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
        <Typography
          component="span"
          role="timer"
          variant="h5"
          color={warning ? 'warning.main' : 'text.primary'}
          sx={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {formatClock(remainingSeconds)}
        </Typography>
        <Typography component="span" variant="body2" color="text.secondary">
          left to finish paying
        </Typography>
      </Box>
      <LinearProgress
        variant="determinate"
        value={holdProgressPercent(remainingSeconds, totalSeconds)}
        color={warning ? 'warning' : 'primary'}
        aria-label="Time left to finish paying"
      />
      <Typography variant="body2" color="warning.main" role="status" aria-live="polite">
        {warning ? `Less than ${formatHoldDuration(warningSeconds)} left. Finish paying to keep your dates.` : ''}
      </Typography>
    </Stack>
  );
}

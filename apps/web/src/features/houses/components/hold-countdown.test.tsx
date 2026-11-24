// @vitest-environment jsdom
/**
 * @file apps/web/src/features/houses/components/hold-countdown.test.tsx
 * @feature houses
 */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HoldCountdown } from './hold-countdown';

interface Overrides {
  totalSeconds?: number;
  remainingSeconds?: number;
  warningSeconds?: number;
  warning?: boolean;
  expired?: boolean;
  reserving?: boolean;
}

function renderCountdown(overrides: Overrides = {}): { onHoldAgain: () => void } {
  const onHoldAgain = vi.fn<() => void>();
  render(
    <HoldCountdown
      totalSeconds={900}
      remainingSeconds={899}
      warningSeconds={300}
      warning={false}
      expired={false}
      reserving={false}
      onHoldAgain={onHoldAgain}
      {...overrides}
    />,
  );
  return { onHoldAgain };
}

describe('HoldCountdown', () => {
  afterEach(cleanup);

  describe('while the dates are held', () => {
    it('says how long the dates are held, from the API\'s seconds', () => {
      renderCountdown();

      expect(screen.getByText('We are holding these dates for you for 15 minutes.')).toBeTruthy();
    });

    it('shows the live clock', () => {
      renderCountdown({ remainingSeconds: 754 });

      expect(screen.getByRole('timer').textContent).toBe('12:34');
    });

    it('fills the progress bar with the share of time left', () => {
      renderCountdown({ totalSeconds: 900, remainingSeconds: 450 });

      expect(screen.getByRole('progressbar', { name: 'Time left to finish paying' }).getAttribute('aria-valuenow')).toBe('50');
    });

    it('is calm until the warning time: no warning message yet', () => {
      renderCountdown();

      expect(screen.getByRole('status').textContent).toBe('');
      expect(screen.queryByText(/Less than/)).toBeNull();
    });

    it('offers no reserve-again button while time is left', () => {
      renderCountdown();

      expect(screen.queryByRole('button', { name: 'Hold the dates again' })).toBeNull();
    });
  });

  describe('when time is running out', () => {
    it('announces a calm warning in a polite live region, with the window length from the API', () => {
      renderCountdown({ warning: true, remainingSeconds: 240, warningSeconds: 300 });

      const status = screen.getByRole('status');
      expect(status.getAttribute('aria-live')).toBe('polite');
      expect(status.textContent).toBe('Less than 5 minutes left. Finish paying to keep your dates.');
    });

    it('follows a different warning window without any code change', () => {
      renderCountdown({ warning: true, warningSeconds: 120 });

      expect(screen.getByRole('status').textContent).toContain('Less than 2 minutes left');
    });

    it('keeps the clock and bar visible while warning', () => {
      renderCountdown({ warning: true, remainingSeconds: 240 });

      expect(screen.getByRole('timer').textContent).toBe('04:00');
      expect(screen.getByRole('progressbar')).toBeTruthy();
    });
  });

  describe('for a bank-transfer hold', () => {
    it('says hours and counts down in hours', () => {
      renderCountdown({ totalSeconds: 172800, remainingSeconds: 172799, warningSeconds: 300 });

      expect(screen.getByText('We are holding these dates for you for 48 hours.')).toBeTruthy();
      expect(screen.getByRole('timer').textContent).toBe('47:59:59');
    });
  });

  describe('when time has run out', () => {
    it('says so, keeps the guest\'s details, and offers Hold the dates again', async () => {
      const { onHoldAgain } = renderCountdown({ expired: true, remainingSeconds: 0 });

      expect(screen.getByText('Time ran out — your details are still here.')).toBeTruthy();
      await userEvent.click(screen.getByRole('button', { name: 'Hold the dates again' }));
      expect(onHoldAgain).toHaveBeenCalledTimes(1);
    });

    it('shows no clock or progress bar any more', () => {
      renderCountdown({ expired: true, remainingSeconds: 0 });

      expect(screen.queryByRole('timer')).toBeNull();
      expect(screen.queryByRole('progressbar')).toBeNull();
    });

    it('disables the button and says Holding your dates… while the new reservation is being made', () => {
      renderCountdown({ expired: true, reserving: true });

      expect(screen.getByRole('button', { name: 'Holding your dates…' }).hasAttribute('disabled')).toBe(true);
    });
  });
});

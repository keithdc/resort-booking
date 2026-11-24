// @vitest-environment jsdom
/**
 * @file apps/web/src/shared/components/copy-code-button.test.tsx
 * @shared Copy code button
 */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CopyCodeButton } from './copy-code-button';

function stubClipboard(writeText: ((text: string) => Promise<void>) | undefined): void {
  Object.defineProperty(navigator, 'clipboard', {
    value: writeText === undefined ? undefined : { writeText },
    configurable: true,
  });
}

describe('CopyCodeButton', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    stubClipboard(undefined);
  });

  it('copies the code and says so in a polite live region', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    stubClipboard(writeText);
    render(<CopyCodeButton code="WELCOME10" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy code WELCOME10' }));
    });

    expect(writeText).toHaveBeenCalledWith('WELCOME10');
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('Code copied');
    expect(status.getAttribute('aria-live')).toBe('polite');
  });

  it('clears the confirmation after a few seconds', async () => {
    stubClipboard(vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined));
    render(<CopyCodeButton code="WELCOME10" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });
    expect(screen.getByRole('status').textContent).toBe('Code copied');

    act(() => {
      vi.advanceTimersByTime(3500);
    });
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('says it could not copy when the clipboard is unavailable, without throwing', async () => {
    stubClipboard(undefined);
    render(<CopyCodeButton code="WELCOME10" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });

    expect(screen.getByRole('status').textContent).toContain('Could not copy');
  });

  it('says it could not copy when the browser refuses', async () => {
    stubClipboard(vi.fn<(text: string) => Promise<void>>().mockRejectedValue(new Error('denied')));
    render(<CopyCodeButton code="WELCOME10" />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });

    expect(screen.getByRole('status').textContent).toContain('Could not copy');
  });

  it('does not update after it is removed', async () => {
    stubClipboard(vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined));
    const { unmount } = render(<CopyCodeButton code="WELCOME10" />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button'));
    });

    unmount();

    expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
  });
});

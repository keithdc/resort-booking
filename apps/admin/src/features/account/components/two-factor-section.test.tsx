// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/account/components/two-factor-section.test.tsx
 * @feature account
 */

import type { TwoFactorRecoveryCodes, TwoFactorSetup, TwoFactorStatus } from '@resort-booking/shared-types';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/shared/services/api-client';
import { TwoFactorSection } from './two-factor-section';

const api = vi.hoisted(() => ({
  fetchTwoFactorStatus: vi.fn<() => Promise<TwoFactorStatus>>(),
  startTwoFactorSetup: vi.fn<(currentPassword: string) => Promise<TwoFactorSetup>>(),
  enableTwoFactor: vi.fn<(currentPassword: string, code: string) => Promise<TwoFactorRecoveryCodes>>(),
  disableTwoFactor: vi.fn<(body: { currentPassword: string; code: string }) => Promise<{ disabled: true }>>(),
  regenerateRecoveryCodes: vi.fn<(body: { currentPassword: string; code: string }) => Promise<TwoFactorRecoveryCodes>>(),
}));
const clip = vi.hoisted(() => ({
  copyText: vi.fn<(text: string) => Promise<boolean>>(),
  downloadTextFile: vi.fn<(name: string, text: string) => void>(),
}));

vi.mock('@/features/identity/services/staff-identity-api', () => api);
vi.mock('../utils/clipboard', () => clip);

const OFF: TwoFactorStatus = { enabled: false, enabledAt: null, setupPending: false, recoveryCodesRemaining: 0 };
const ON: TwoFactorStatus = { enabled: true, enabledAt: '2026-11-01T10:00:00.000Z', setupPending: false, recoveryCodesRemaining: 8 };
const SETUP: TwoFactorSetup = {
  secret: 'JBSWY3DPEHPK3PXP',
  otpauthUri: 'otpauth://totp/Humphreys:ada%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Humphreys',
  issuer: 'Humphreys',
  accountName: 'ada@example.com',
};
const CODES = ['AAAAA-BBBBB', 'CCCCC-DDDDD', 'EEEEE-FFFFF', 'GGGGG-HHHHH', 'JJJJJ-KKKKK', 'MMMMM-NNNNN', 'PPPPP-QQQQQ', 'RRRRR-SSSSS', 'TTTTT-UUUUU', 'VVVVV-WWWWW'];

function type(label: string | RegExp, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

/** Opens the password dialog from the Off state and continues with `password`. */
async function startSetup(password = 'right-pass'): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: 'Turn on two-step verification' }));
  const dialog = await screen.findByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(/Current password/), { target: { value: password } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Continue' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}

describe('TwoFactorSection', () => {
  beforeEach(() => {
    for (const fn of [...Object.values(api), ...Object.values(clip)]) {
      fn.mockReset();
    }
    clip.copyText.mockResolvedValue(true);
  });
  afterEach(cleanup);

  it('shows a loading state, then Off with a button to turn it on', async () => {
    api.fetchTwoFactorStatus.mockResolvedValue(OFF);
    render(<TwoFactorSection />);

    expect(screen.getByLabelText('Loading two-step verification')).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Turn on two-step verification' })).toBeTruthy();
    expect(screen.getByText('Off')).toBeTruthy();
  });

  it('shows the error when the status cannot be loaded', async () => {
    api.fetchTwoFactorStatus.mockRejectedValue(new ApiRequestError('Server is down', 500));
    render(<TwoFactorSection />);

    expect(await screen.findByText('Server is down')).toBeTruthy();
  });

  it('setup shows a QR code, the key as text and a collapsed link with copy buttons, and does not turn anything on by itself', async () => {
    api.fetchTwoFactorStatus.mockResolvedValue(OFF);
    api.startTwoFactorSetup.mockResolvedValue(SETUP);
    render(<TwoFactorSection />);

    await startSetup();

    expect(await screen.findByTestId('copyable-Setup key')).toHaveProperty('textContent', SETUP.secret);
    expect(screen.getByText('Scan this QR code with your authenticator app, then enter the 6-digit code.')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'QR code for your authenticator app' }).tagName.toLowerCase()).toBe('svg');
    expect(screen.getByText(/Can't scan\?/)).toBeTruthy();
    expect(screen.queryByTestId('copyable-Setup link')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show setup link' }));
    expect(screen.getByTestId('copyable-Setup link').textContent).toBe(SETUP.otpauthUri);
    fireEvent.click(screen.getByRole('button', { name: 'Copy setup key' }));
    await waitFor(() => expect(clip.copyText).toHaveBeenCalledWith(SETUP.secret));
    expect(api.startTwoFactorSetup).toHaveBeenCalledWith('right-pass');
    expect(api.enableTwoFactor).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Confirm and turn on' }).hasAttribute('disabled')).toBe(true);
  });

  it('confirms the code, then shows the recovery codes once with copy and download, and needs a confirmation to close', async () => {
    api.fetchTwoFactorStatus.mockResolvedValueOnce(OFF).mockResolvedValue(ON);
    api.startTwoFactorSetup.mockResolvedValue(SETUP);
    api.enableTwoFactor.mockResolvedValue({ recoveryCodes: CODES });
    render(<TwoFactorSection />);
    await startSetup();
    await screen.findByTestId('copyable-Setup key');

    type('6-digit code', '123 456');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and turn on' }));

    const panel = await screen.findByLabelText('Recovery codes');
    expect(api.enableTwoFactor).toHaveBeenCalledWith('right-pass', '123 456');
    expect(await screen.findByText(/other signed-in devices were signed out/)).toBeTruthy();
    expect(within(panel).getAllByRole('listitem')).toHaveLength(10);
    expect(within(panel).getByText('AAAAA-BBBBB')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Copy codes' }));
    await waitFor(() => expect(clip.copyText).toHaveBeenCalledWith(CODES.join('\n')));
    expect(await screen.findByText('Copied')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Download .txt' }));
    expect(clip.downloadTextFile).toHaveBeenCalledWith('humphreys-recovery-codes.txt', expect.stringContaining('AAAAA-BBBBB'));

    expect(screen.getByRole('button', { name: 'Done' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByLabelText(/I have saved these recovery codes/));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(screen.queryByLabelText('Recovery codes')).toBeNull());
    expect(screen.queryByText('AAAAA-BBBBB')).toBeNull();
    expect(await screen.findByText('8 recovery codes left.')).toBeTruthy();
  });

  it('shows a wrong setup code and lets the person try again', async () => {
    api.fetchTwoFactorStatus.mockResolvedValue(OFF);
    api.startTwoFactorSetup.mockResolvedValue(SETUP);
    api.enableTwoFactor.mockRejectedValue(new ApiRequestError('That code is not valid', 401, { code: 'TWO_FACTOR_CODE_INVALID' }));
    render(<TwoFactorSection />);
    await startSetup();
    await screen.findByTestId('copyable-Setup key');

    type('6-digit code', '000000');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and turn on' }));

    expect(await screen.findByText('That code is not valid')).toBeTruthy();
    expect((screen.getByLabelText('6-digit code') as HTMLInputElement).value).toBe('');
    expect(screen.queryByLabelText('Recovery codes')).toBeNull();
  });

  it('asks for the password before anything starts, shows a wrong password and does not start the setup', async () => {
    api.fetchTwoFactorStatus.mockResolvedValue(OFF);
    api.startTwoFactorSetup.mockRejectedValueOnce(new ApiRequestError('Current password is wrong', 401, { code: 'STAFF_PASSWORD_MISMATCH' }));
    render(<TwoFactorSection />);

    fireEvent.click(await screen.findByRole('button', { name: 'Turn on two-step verification' }));
    const dialog = await screen.findByRole('dialog');
    expect(api.startTwoFactorSetup).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('button', { name: 'Continue' }).hasAttribute('disabled')).toBe(true);
    fireEvent.change(within(dialog).getByLabelText(/Current password/), { target: { value: 'nope' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue' }));

    expect(await within(dialog).findByText('Current password is wrong')).toBeTruthy();
    expect(screen.queryByTestId('copyable-Setup key')).toBeNull();
    expect((within(dialog).getByLabelText(/Current password/) as HTMLInputElement).value).toBe('');
  });

  it('tells the person to start again when the password is refused at the final step', async () => {
    api.fetchTwoFactorStatus.mockResolvedValue(OFF);
    api.startTwoFactorSetup.mockResolvedValue(SETUP);
    api.enableTwoFactor.mockRejectedValue(new ApiRequestError('Current password is wrong', 401, { code: 'STAFF_PASSWORD_MISMATCH' }));
    render(<TwoFactorSection />);
    await startSetup();
    await screen.findByTestId('copyable-Setup key');

    type('6-digit code', '123456');
    fireEvent.click(screen.getByRole('button', { name: 'Confirm and turn on' }));

    expect(await screen.findByText(/password was not accepted/)).toBeTruthy();
  });

  it('cancelling the setup goes back to Off', async () => {
    api.fetchTwoFactorStatus.mockResolvedValue(OFF);
    api.startTwoFactorSetup.mockResolvedValue(SETUP);
    render(<TwoFactorSection />);
    await startSetup();
    await screen.findByTestId('copyable-Setup key');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(await screen.findByRole('button', { name: 'Turn on two-step verification' })).toBeTruthy();
  });

  it('when on: shows the state, the codes left and a warning when few are left', async () => {
    api.fetchTwoFactorStatus.mockResolvedValue({ ...ON, recoveryCodesRemaining: 2 });
    render(<TwoFactorSection />);

    expect(await screen.findByText(/On since/)).toBeTruthy();
    expect(screen.getByText(/2 recovery codes left\. Get new ones/)).toBeTruthy();
    expect(screen.getByText('On')).toBeTruthy();
  });

  it('turns it off only after a confirmation dialog with password and code, and shows server errors', async () => {
    api.fetchTwoFactorStatus.mockResolvedValueOnce(ON).mockResolvedValue(OFF);
    api.disableTwoFactor.mockRejectedValueOnce(new ApiRequestError('Current password is wrong', 401, { code: 'STAFF_PASSWORD_MISMATCH' }));
    api.disableTwoFactor.mockResolvedValueOnce({ disabled: true });
    render(<TwoFactorSection />);

    fireEvent.click(await screen.findByRole('button', { name: 'Turn off' }));
    const dialog = await screen.findByRole('dialog');
    expect(api.disableTwoFactor).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('button', { name: 'Turn off' }).hasAttribute('disabled')).toBe(true);

    fireEvent.change(within(dialog).getByLabelText(/Current password/), { target: { value: 'wrong-pass' } });
    fireEvent.change(within(dialog).getByLabelText(/Authenticator or recovery code/), { target: { value: '123456' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Turn off' }));
    expect(await within(dialog).findByText('Current password is wrong')).toBeTruthy();

    fireEvent.change(within(dialog).getByLabelText(/Current password/), { target: { value: 'right-pass' } });
    fireEvent.change(within(dialog).getByLabelText(/Authenticator or recovery code/), { target: { value: 'ABCDE-FGHJK' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Turn off' }));

    await waitFor(() => expect(api.disableTwoFactor).toHaveBeenLastCalledWith({ currentPassword: 'right-pass', code: 'ABCDE-FGHJK' }));
    expect(await screen.findByRole('button', { name: 'Turn on two-step verification' })).toBeTruthy();
  });

  it('cancelling the turn-off dialog changes nothing', async () => {
    api.fetchTwoFactorStatus.mockResolvedValue(ON);
    render(<TwoFactorSection />);

    fireEvent.click(await screen.findByRole('button', { name: 'Turn off' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.disableTwoFactor).not.toHaveBeenCalled();
    expect(screen.getByText(/On since/)).toBeTruthy();
  });

  it('regenerates the recovery codes with password and code and shows the new ones once', async () => {
    api.fetchTwoFactorStatus.mockResolvedValue(ON);
    api.regenerateRecoveryCodes.mockResolvedValue({ recoveryCodes: CODES });
    render(<TwoFactorSection />);

    fireEvent.click(await screen.findByRole('button', { name: 'Get new recovery codes' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/Current password/), { target: { value: 'right-pass' } });
    fireEvent.change(within(dialog).getByLabelText(/Authenticator or recovery code/), { target: { value: '654321' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Get new codes' }));

    const panel = await screen.findByLabelText('Recovery codes');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(api.regenerateRecoveryCodes).toHaveBeenCalledWith({ currentPassword: 'right-pass', code: '654321' });
    expect(within(panel).getAllByRole('listitem')).toHaveLength(10);
  });
});

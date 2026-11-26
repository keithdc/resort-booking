// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/configuration/components/configuration.test.tsx
 * @feature configuration
 */

import type { OrganizationSettings, StaffProfile } from '@resort-booking/shared-types';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/shared/services/api-client';
import { organizationSettings, staffProfile } from '@/test/fixtures';
import { AccountSummary } from './account-summary';
import { ConfigurationPage } from './configuration-page';
import { OrganizationSettingsForm } from './organization-settings-form';
import { OwnerAccountForm } from './owner-account-form';
import { SaveBar } from './save-bar';

const api = vi.hoisted(() => ({
  fetchStaffMe: vi.fn<() => Promise<StaffProfile>>(),
  saveStaffProfile: vi.fn<(body: { fullName: string; email: string }) => Promise<StaffProfile>>(),
  changeStaffPassword: vi.fn<(body: { currentPassword: string; newPassword: string }) => Promise<{ changed: true }>>(),
  fetchOrganizationSettings: vi.fn<() => Promise<OrganizationSettings>>(),
  saveOrganizationSettings: vi.fn<(body: Partial<OrganizationSettings>) => Promise<OrganizationSettings>>(),
}));

vi.mock('@/features/identity/services/staff-identity-api', () => ({
  fetchStaffMe: api.fetchStaffMe,
  saveStaffProfile: api.saveStaffProfile,
  changeStaffPassword: api.changeStaffPassword,
}));
// The two-step verification section has its own tests (features/account).
vi.mock('@/features/account', () => ({ TwoFactorSection: (): null => null, SignedInDevices: (): null => null }));
vi.mock('@/features/property/services/staff-property-api', () => ({
  fetchOrganizationSettings: api.fetchOrganizationSettings,
  saveOrganizationSettings: api.saveOrganizationSettings,
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }): React.JSX.Element => <a href={href}>{children}</a>,
}));
vi.mock('@resort-booking/ui/contact', () => ({
  isValidEmail: (value: string): boolean => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value),
  isValidPhone: (value: string): boolean => /^\+\d{8,}$/.test(value),
  EmailField: ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }): React.JSX.Element => (
    <input aria-label={label} value={value} onChange={(event): void => onChange(event.target.value)} />
  ),
  PhoneField: ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }): React.JSX.Element => (
    <input aria-label={label} value={value} onChange={(event): void => onChange(event.target.value)} />
  ),
}));

/** The text of each line of the password checklist. */
function rules(): string[] {
  return within(screen.getByRole('list', { name: 'Password rules' }))
    .getAllByRole('listitem')
    .map((item) => item.textContent ?? '');
}

function type(label: string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('SaveBar', () => {
  afterEach(cleanup);

  const base = { dirty: false, pending: false, problem: null, saveLabel: 'Save', onSave: vi.fn(), onDiscard: vi.fn() };

  it('says all is saved and keeps Save and Discard off when nothing changed', () => {
    render(<SaveBar {...base} />);

    expect(screen.getByText('All changes saved')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Discard' }).hasAttribute('disabled')).toBe(true);
  });

  it('offers Save and Discard once something changed', () => {
    const onSave = vi.fn();
    const onDiscard = vi.fn();
    render(<SaveBar {...base} dirty onSave={onSave} onDiscard={onDiscard} />);

    expect(screen.getByText('You have unsaved changes')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onDiscard).toHaveBeenCalledTimes(1);
  });

  it('explains a problem in words and blocks Save but not Discard', () => {
    render(<SaveBar {...base} dirty problem="Enter a valid address." />);

    expect(screen.getByText('Enter a valid address.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Discard' }).hasAttribute('disabled')).toBe(false);
  });

  it('shows Saving while pending and blocks both buttons', () => {
    render(<SaveBar {...base} dirty pending />);

    expect(screen.getAllByText('Saving…').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Discard' }).hasAttribute('disabled')).toBe(true);
  });
});

describe('AccountSummary', () => {
  afterEach(cleanup);

  it('shows who is signed in and the business', () => {
    render(<AccountSummary staff={staffProfile()} org={organizationSettings()} />);

    expect(screen.getByRole('region', { name: 'Signed-in account' })).toBeTruthy();
    expect(screen.getByText('Marie Dupont')).toBeTruthy();
    expect(screen.getByText('marie@humphreys.example')).toBeTruthy();
    expect(screen.getByText('Humphreys')).toBeTruthy();
  });
});

describe('OwnerAccountForm', () => {
  beforeEach(() => {
    api.saveStaffProfile.mockReset();
    api.changeStaffPassword.mockReset();
  });
  afterEach(cleanup);

  it('waits for a change, then saves the login and confirms', async () => {
    api.saveStaffProfile.mockResolvedValue(staffProfile({ fullName: 'Marie D.' }));
    render(<OwnerAccountForm initial={staffProfile()} />);
    expect(screen.getByRole('button', { name: 'Save login' }).hasAttribute('disabled')).toBe(true);

    type('Your name', 'Marie D.');
    expect(screen.getByText('You have unsaved changes')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save login' }));

    await waitFor(() => expect(screen.getByText('Account saved')).toBeTruthy());
    expect(api.saveStaffProfile).toHaveBeenCalledWith({ fullName: 'Marie D.', email: 'marie@humphreys.example' });
    expect(screen.getByText('All changes saved')).toBeTruthy();
  });

  it('blocks saving with an invalid email and says why', () => {
    render(<OwnerAccountForm initial={staffProfile()} />);

    type('Login email', 'nope');

    expect(screen.getByText('Enter a valid login email to save.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save login' }).hasAttribute('disabled')).toBe(true);
  });

  it('discards edits back to what was saved', () => {
    render(<OwnerAccountForm initial={staffProfile()} />);

    type('Your name', 'Someone else');
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    expect((screen.getByLabelText('Your name') as HTMLInputElement).value).toBe('Marie Dupont');
  });

  it('shows the API message when saving fails', async () => {
    api.saveStaffProfile.mockRejectedValue(new ApiRequestError('Email already used', 409));
    render(<OwnerAccountForm initial={staffProfile()} />);

    type('Your name', 'Marie D.');
    fireEvent.click(screen.getByRole('button', { name: 'Save login' }));

    expect(await screen.findByText('Email already used')).toBeTruthy();
  });

  it('changes the password only with both fields and a password that meets every rule', async () => {
    api.changeStaffPassword.mockResolvedValue({ changed: true });
    render(<OwnerAccountForm initial={staffProfile()} />);
    const button = screen.getByRole('button', { name: 'Change password' });
    expect(button.hasAttribute('disabled')).toBe(true);

    type('Current password', 'OldPass1!');
    type('New password', 'short');
    expect(button.hasAttribute('disabled')).toBe(true);

    type('New password', 'Sunny2027');
    expect(button.hasAttribute('disabled')).toBe(true);

    type('New password', 'Sunny-Days-2027');
    expect(button.hasAttribute('disabled')).toBe(false);
    fireEvent.click(button);

    await waitFor(() => expect(api.changeStaffPassword).toHaveBeenCalledWith({ currentPassword: 'OldPass1!', newPassword: 'Sunny-Days-2027' }));
    await waitFor(() => expect((screen.getByLabelText('New password') as HTMLInputElement).value).toBe(''));
  });

  it('blocks a new password made from the first part of the sign-in email', () => {
    render(<OwnerAccountForm initial={staffProfile()} />);
    type('Current password', 'OldPass1!');

    type('New password', 'Marie-Is-Great-1');

    expect(screen.getByRole('button', { name: 'Change password' }).hasAttribute('disabled')).toBe(true);
    expect(rules().find((text) => text.startsWith('Does not contain your email name'))).toBe('Does not contain your email name (not yet)');
  });

  it('shows a live checklist with how many rules are met', () => {
    render(<OwnerAccountForm initial={staffProfile()} />);
    expect(screen.getByText('2 of 6 password rules met')).toBeTruthy();

    type('New password', 'Sunny');
    expect(screen.getByText('4 of 6 password rules met')).toBeTruthy();
    expect(rules()).toContain('A capital letter (met)');
    expect(rules()).toContain('At least 10 characters (not yet)');

    type('New password', 'Sunny-Days-2027');
    expect(screen.getByText('All password rules are met')).toBeTruthy();
  });

  it('shows and hides the new password with a toggle button', () => {
    render(<OwnerAccountForm initial={staffProfile()} />);
    const field = screen.getByLabelText('New password') as HTMLInputElement;
    const toggle = screen.getByRole('button', { name: 'Show password' });
    expect(field.type).toBe('password');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(toggle);
    expect(field.type).toBe('text');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(toggle);
    expect(field.type).toBe('password');
  });

  it('shows the API message when the password change fails', async () => {
    api.changeStaffPassword.mockRejectedValue(new ApiRequestError('Current password is wrong', 401, { code: 'STAFF_PASSWORD_MISMATCH' }));
    render(<OwnerAccountForm initial={staffProfile()} />);

    type('Current password', 'bad');
    type('New password', 'Sunny-Days-2027');
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText('Current password is wrong')).toBeTruthy();
  });

  it('lists every rule the server says the password breaks', async () => {
    api.changeStaffPassword.mockRejectedValue(
      new ApiRequestError('Password is too weak', 400, { code: 'PASSWORD_TOO_WEAK', problems: ['Use at least 10 characters', 'Add a number'] }),
    );
    render(<OwnerAccountForm initial={staffProfile()} />);

    type('Current password', 'OldPass1!');
    type('New password', 'Sunny-Days-2027');
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('The server did not accept that password');
    expect(within(alert).getByText('Use at least 10 characters')).toBeTruthy();
    expect(within(alert).getByText('Add a number')).toBeTruthy();
  });
});

describe('OrganizationSettingsForm', () => {
  beforeEach(() => {
    api.saveOrganizationSettings.mockReset();
  });
  afterEach(cleanup);

  it('groups the fields in three cards with one save bar', () => {
    render(<OrganizationSettingsForm initial={organizationSettings()} />);

    for (const name of ['Business name and owner', 'Emails and phone guests see', 'Transfer details']) {
      expect(screen.getByRole('region', { name })).toBeTruthy();
    }
    expect(screen.getAllByRole('button', { name: 'Save business details' })).toHaveLength(1);
    expect(screen.getByText('All changes saved')).toBeTruthy();
  });

  it('saves every field and confirms', async () => {
    api.saveOrganizationSettings.mockImplementation((body) => Promise.resolve(organizationSettings(body)));
    render(<OrganizationSettingsForm initial={organizationSettings()} />);

    type('IBAN', 'FR7600000000000000000000000');
    fireEvent.click(screen.getByRole('button', { name: 'Save business details' }));

    await waitFor(() => expect(screen.getByText('Organization saved')).toBeTruthy());
    expect(api.saveOrganizationSettings).toHaveBeenCalledWith(expect.objectContaining({ iban: 'FR7600000000000000000000000', name: 'Humphreys' }));
    expect(screen.getByText('All changes saved')).toBeTruthy();
  });

  it('blocks saving while an email is invalid and says so', () => {
    render(<OrganizationSettingsForm initial={organizationSettings()} />);

    type('Ops email', 'broken');

    expect(screen.getByText('Enter a valid address in each email field to save.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save business details' }).hasAttribute('disabled')).toBe(true);
  });

  it('blocks saving an invalid phone but allows an empty one', () => {
    render(<OrganizationSettingsForm initial={organizationSettings()} />);

    type('Ops phone', '123');
    expect(screen.getByText('The ops phone number is not valid yet.')).toBeTruthy();

    type('Ops phone', '');
    type('Owner name', 'Someone');
    expect(screen.queryByText('The ops phone number is not valid yet.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save business details' }).hasAttribute('disabled')).toBe(false);
  });

  it('discards edits and shows the API message when saving fails', async () => {
    api.saveOrganizationSettings.mockRejectedValue(new ApiRequestError('Not allowed', 403));
    render(<OrganizationSettingsForm initial={organizationSettings()} />);

    type('Owner name', 'Someone');
    fireEvent.click(screen.getByRole('button', { name: 'Save business details' }));
    expect(await screen.findByText('Not allowed')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect((screen.getByLabelText('Owner name') as HTMLInputElement).value).toBe('Marie Dupont');
  });
});

describe('ConfigurationPage', () => {
  beforeEach(() => {
    api.fetchStaffMe.mockReset();
    api.fetchOrganizationSettings.mockReset();
  });
  afterEach(cleanup);

  it('shows placeholders, then the summary and every section', async () => {
    api.fetchStaffMe.mockResolvedValue(staffProfile());
    api.fetchOrganizationSettings.mockResolvedValue(organizationSettings());

    render(<ConfigurationPage />);
    expect(screen.getByLabelText('Loading account')).toBeTruthy();

    expect(await screen.findByRole('region', { name: 'Signed-in account' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Account' })).toBeTruthy();
    for (const name of ['Your staff login', 'Business name and owner', 'Emails and phone guests see', 'Transfer details', 'Cancellation, refunds and extras']) {
      expect(screen.getByRole('region', { name })).toBeTruthy();
    }
    expect(screen.getByRole('link', { name: 'Open properties' }).getAttribute('href')).toBe('/properties');
  });

  it('shows an employee only their own login: the business settings answer 403', async () => {
    api.fetchStaffMe.mockResolvedValue(staffProfile());
    api.fetchOrganizationSettings.mockRejectedValue(new ApiRequestError('Forbidden', 403));

    render(<ConfigurationPage />);

    expect(await screen.findByRole('region', { name: 'Your staff login' })).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Business name and owner' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Cancellation, refunds and extras' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the error and no forms when loading fails', async () => {
    api.fetchStaffMe.mockRejectedValue(new ApiRequestError('Staff authentication required', 401));
    api.fetchOrganizationSettings.mockResolvedValue(organizationSettings());

    render(<ConfigurationPage />);

    expect(await screen.findByText('Staff authentication required')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'Your staff login' })).toBeNull();
    expect(screen.queryByLabelText('Loading account')).toBeNull();
  });
});

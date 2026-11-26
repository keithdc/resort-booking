// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/registration/components/registration-link.test.tsx
 * @feature registration
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RegistrationLink } from './registration-link';

const api = vi.hoisted(() => ({ fetchRegistrationStatus: vi.fn<() => Promise<{ open: boolean }>>() }));
vi.mock('../services/registration-api', () => ({ fetchRegistrationStatus: api.fetchRegistrationStatus }));

describe('RegistrationLink', () => {
  beforeEach(() => {
    api.fetchRegistrationStatus.mockReset();
  });
  afterEach(cleanup);

  it('links to /register when registration is open', async () => {
    api.fetchRegistrationStatus.mockResolvedValue({ open: true });

    render(<RegistrationLink />);

    expect((await screen.findByRole('link', { name: 'Create an account' })).getAttribute('href')).toBe('/register');
  });

  it('shows nothing when registration is closed', async () => {
    api.fetchRegistrationStatus.mockResolvedValue({ open: false });

    const { container } = render(<RegistrationLink />);

    await waitFor(() => expect(api.fetchRegistrationStatus).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });

  it('shows nothing when the status cannot be read', async () => {
    api.fetchRegistrationStatus.mockRejectedValue(new Error('offline'));

    const { container } = render(<RegistrationLink />);

    await waitFor(() => expect(api.fetchRegistrationStatus).toHaveBeenCalled());
    expect(container.textContent).toBe('');
  });
});

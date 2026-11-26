// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/refunds/components/refunds-page.test.tsx
 * @feature refunds
 */

import type { MarkRefundPaidRequest, PropertySummary, StaffRefund } from '@resort-booking/shared-types';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/shared/services/api-client';
import { staffRefund } from '@/test/fixtures';
import type { RefundListStatus } from '../services/staff-refunds-api';
import { RefundsPage } from './refunds-page';

const refundsApi = vi.hoisted(() => ({
  fetchStaffRefunds: vi.fn<(status: RefundListStatus, propertyId: string) => Promise<StaffRefund[]>>(),
  retryStaffRefund: vi.fn<(id: string) => Promise<StaffRefund>>(),
  markStaffRefundPaid: vi.fn<(id: string, body: MarkRefundPaidRequest) => Promise<StaffRefund>>(),
}));
const propertyApi = vi.hoisted(() => ({
  fetchStaffProperties: vi.fn<() => Promise<PropertySummary[]>>(),
}));

const role = vi.hoisted(() => ({ canManageRefunds: true }));

vi.mock('@/shared/hooks/use-staff-role', () => ({ useCanManageRefunds: (): boolean => role.canManageRefunds }));
vi.mock('../services/staff-refunds-api', () => refundsApi);
vi.mock('@/features/property/services/staff-property-api', () => propertyApi);

const HAND = staffRefund({ id: 'a', reference: 'BK-AAA0000000', bookerName: 'Ada Lovelace', status: 'pending', provider: 'manual' });
const FAILED = staffRefund({ id: 'b', reference: 'BK-BBB0000000', bookerName: 'Grace Hopper', status: 'failed', provider: 'mock', failureReason: 'card_closed' });

const plain = (text: string | null | undefined): string => (text ?? '').replace(/\s/g, ' ');

function property(id: string, name: string): PropertySummary {
  return {
    id,
    organizationId: 'o',
    slug: id,
    name,
    description: '',
    city: 'Annecy',
    countryCode: 'FR',
    latitude: 0,
    longitude: 0,
    phone: '',
    email: '',
    published: true,
    timezone: 'Europe/Paris',
    coverPhotoUrl: null,
    customRequestsEnabled: false,
    addressLine: '',
    postalCode: '',
  };
}

describe('RefundsPage', () => {
  beforeEach(() => {
    role.canManageRefunds = true;
    Object.values(refundsApi).forEach((mock) => mock.mockReset());
    propertyApi.fetchStaffProperties.mockReset();
    refundsApi.fetchStaffRefunds.mockResolvedValue([HAND, FAILED]);
    propertyApi.fetchStaffProperties.mockResolvedValue([property('p1', 'Alpine Lake'), property('p2', 'Pine Coast')]);
  });

  afterEach(cleanup);

  it('starts on "Needs attention" and lists those refunds in a table', async () => {
    render(<RefundsPage />);

    const table = await screen.findByRole('table', { name: 'Refunds' });
    expect(refundsApi.fetchStaffRefunds).toHaveBeenCalledWith('needs_attention', '');
    expect(screen.getByRole('button', { name: 'Needs attention' }).getAttribute('aria-pressed')).toBe('true');
    const text = plain(table.textContent);
    expect(text).toContain('BK-AAA0000000');
    expect(text).toContain('Ada Lovelace');
    expect(text).toContain('Lake Chalet, Alpine Lake');
    expect(text).toContain('720,00 € (75%)');
    expect(text).toContain('Cancellation refund');
    expect(text).toContain('By hand');
    expect(text).toContain('card_closed');
  });

  it('shows a loading state first', () => {
    refundsApi.fetchStaffRefunds.mockImplementation(() => new Promise<StaffRefund[]>(() => undefined));

    render(<RefundsPage />);

    expect(screen.getByLabelText('Loading refunds')).toBeTruthy();
  });

  it('says "Nothing needs your attention." when the list is empty', async () => {
    refundsApi.fetchStaffRefunds.mockResolvedValue([]);

    render(<RefundsPage />);

    expect(await screen.findByText('Nothing needs your attention.')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('says "No refunds here." for an empty list under another chip', async () => {
    refundsApi.fetchStaffRefunds.mockResolvedValue([]);
    render(<RefundsPage />);
    await screen.findByText('Nothing needs your attention.');

    await userEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(await screen.findByText('No refunds here.')).toBeTruthy();
    expect(refundsApi.fetchStaffRefunds).toHaveBeenLastCalledWith('succeeded', '');
  });

  it('shows the API message when the refunds cannot be loaded', async () => {
    refundsApi.fetchStaffRefunds.mockRejectedValue(new ApiRequestError('Staff authentication required', 401));

    render(<RefundsPage />);

    expect(await screen.findByText('Staff authentication required')).toBeTruthy();
  });

  it('filters by chip', async () => {
    render(<RefundsPage />);
    await screen.findByRole('table');

    await userEvent.click(screen.getByRole('button', { name: 'Failed' }));

    await waitFor(() => expect(refundsApi.fetchStaffRefunds).toHaveBeenLastCalledWith('failed', ''));
    expect(screen.getByRole('button', { name: 'Failed' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('filters by property', async () => {
    render(<RefundsPage />);
    await screen.findByRole('table');

    await userEvent.click(screen.getByRole('combobox', { name: 'Property' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Pine Coast' }));

    await waitFor(() => expect(refundsApi.fetchStaffRefunds).toHaveBeenLastCalledWith('needs_attention', 'p2'));
  });

  it('still works for all properties if the property list cannot be loaded', async () => {
    propertyApi.fetchStaffProperties.mockRejectedValue(new Error('offline'));

    render(<RefundsPage />);

    expect(await screen.findByRole('table', { name: 'Refunds' })).toBeTruthy();
  });

  it('searches the list and offers a clear button that brings everything back', async () => {
    render(<RefundsPage />);
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'grace' } });
    expect(plain(screen.getByRole('table').textContent)).not.toContain('Ada Lovelace');
    expect(plain(screen.getByRole('table').textContent)).toContain('Grace Hopper');

    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(plain(screen.getByRole('table').textContent)).toContain('Ada Lovelace');
    expect((screen.getByLabelText('Search') as HTMLInputElement).value).toBe('');
  });

  it('says when nothing matches the search', async () => {
    render(<RefundsPage />);
    await screen.findByRole('table');

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'zzz' } });

    expect(screen.getByText('No refund matches your search.')).toBeTruthy();
  });

  describe('acting on a refund', () => {
    async function openRow(reference: string): Promise<void> {
      await userEvent.click(within(await screen.findByRole('table')).getByText(reference));
    }

    it('hides Retry from an employee WITHOUT refund access who opens a failed refund', async () => {
      role.canManageRefunds = false;
      render(<RefundsPage />);

      await openRow('BK-BBB0000000');

      expect(plain((await screen.findByRole('dialog')).textContent)).toContain('Grace Hopper');
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    });

    it('opens a refund with its details when its row is clicked', async () => {
      render(<RefundsPage />);

      await openRow('BK-BBB0000000');

      expect(plain((await screen.findByRole('dialog')).textContent)).toContain('Grace Hopper');
      expect(screen.getByRole('button', { name: 'Retry' })).toBeTruthy();
    });

    it('retries a failed refund, closes it from the "needs attention" list, and says so', async () => {
      refundsApi.retryStaffRefund.mockResolvedValue({ ...FAILED, status: 'succeeded' });
      render(<RefundsPage />);
      await openRow('BK-BBB0000000');

      await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));

      expect(await screen.findByText('Refund sent again')).toBeTruthy();
      expect(refundsApi.retryStaffRefund).toHaveBeenCalledWith('b');
      await waitFor(() => expect(within(screen.getByRole('table')).queryByText('BK-BBB0000000')).toBeNull());
    });

    it('shows the API message inside the dialog when a retry is refused', async () => {
      refundsApi.retryStaffRefund.mockRejectedValue(new ApiRequestError('This refund cannot be retried.', 409));
      render(<RefundsPage />);
      await openRow('BK-BBB0000000');

      await userEvent.click(await screen.findByRole('button', { name: 'Retry' }));

      expect(await screen.findByText('This refund cannot be retried.')).toBeTruthy();
      expect(within(screen.getByRole('table', { hidden: true })).getByText('BK-BBB0000000')).toBeTruthy();
    });

    it('marks a hand refund as sent after the staff member writes how and when', async () => {
      refundsApi.markStaffRefundPaid.mockResolvedValue({ ...HAND, status: 'succeeded' });
      render(<RefundsPage />);
      await openRow('BK-AAA0000000');

      await userEvent.click(await screen.findByRole('button', { name: 'Mark as refunded…' }));
      fireEvent.change(await screen.findByLabelText(/How and when/), { target: { value: 'Bank transfer 3 June' } });
      await userEvent.click(screen.getByRole('button', { name: /^Yes, I sent/ }));

      expect(await screen.findByText('Refund marked as sent')).toBeTruthy();
      expect(refundsApi.markStaffRefundPaid).toHaveBeenCalledWith('a', { note: 'Bank transfer 3 June' });
      await waitFor(() => expect(within(screen.getByRole('table')).queryByText('BK-AAA0000000')).toBeNull());
    });

    it('does not mark anything when the staff member backs out with "Not yet"', async () => {
      render(<RefundsPage />);
      await openRow('BK-AAA0000000');
      await userEvent.click(await screen.findByRole('button', { name: 'Mark as refunded…' }));

      await userEvent.click(await screen.findByRole('button', { name: 'Not yet' }));

      expect(refundsApi.markStaffRefundPaid).not.toHaveBeenCalled();
      expect(within(screen.getByRole('table', { hidden: true })).getByText('BK-AAA0000000')).toBeTruthy();
    });
  });
});

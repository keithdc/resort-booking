// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/reservations/components/staff-cancel-dialog.test.tsx
 * @feature reservations
 */

import type { StaffCancelPreview, StaffCancelRequest, StaffCancelResult } from '@resort-booking/shared-types';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/shared/services/api-client';
import { staffRefund, staffReservation } from '@/test/fixtures';
import { StaffCancelDialog } from './staff-cancel-dialog';

const api = vi.hoisted(() => ({
  fetchStaffCancelPreview: vi.fn<(id: string) => Promise<StaffCancelPreview>>(),
  cancelStaffReservation: vi.fn<(id: string, body: StaffCancelRequest) => Promise<StaffCancelResult>>(),
}));

vi.mock('../services/staff-reservations-api', () => api);

const PREVIEW: StaffCancelPreview = {
  reservationId: 'r1',
  reference: 'BK-ABC1234567',
  paidCents: 96000,
  currencyCode: 'EUR',
  canCancel: true,
  blockedReason: null,
  policyRefund: { paidCents: 96000, refundPercent: 75, refundCents: 72000, currencyCode: 'EUR', daysBeforeCheckIn: 4 },
};

const RESULT: StaffCancelResult = { reservation: staffReservation({ status: 'cancelled' }), refund: staffRefund() };

const plain = (text: string | null | undefined): string => (text ?? '').replace(/\s/g, ' ');

function renderDialog(): { onClose: () => void; onCancelled: (result: StaffCancelResult) => void } {
  const handlers = { onClose: vi.fn<() => void>(), onCancelled: vi.fn<(result: StaffCancelResult) => void>() };
  render(<StaffCancelDialog open reservationId="r1" reference="BK-ABC1234567" {...handlers} />);
  return handlers;
}

async function loaded(): Promise<void> {
  await screen.findByText(/The guest has paid/);
}

function confirmButton(): HTMLElement {
  return screen.getByRole('button', { name: /^Cancel (and refund|with no refund|booking)|Cancelling…/ });
}

describe('StaffCancelDialog', () => {
  beforeEach(() => {
    api.fetchStaffCancelPreview.mockReset();
    api.cancelStaffReservation.mockReset();
    api.fetchStaffCancelPreview.mockResolvedValue(PREVIEW);
  });

  afterEach(cleanup);

  it('shows a loading state while it checks what was paid', () => {
    api.fetchStaffCancelPreview.mockImplementation(() => new Promise<StaffCancelPreview>(() => undefined));

    renderDialog();

    expect(screen.getByLabelText('Loading cancellation details')).toBeTruthy();
  });

  it('shows what the guest paid and what each reason means in money', async () => {
    renderDialog();
    await loaded();

    const dialog = plain(screen.getByRole('dialog').textContent);
    expect(dialog).toContain('The guest has paid 960,00 €');
    expect(dialog).toContain('Guest asked: policy refund 720,00 € (75%)');
    expect(dialog).toContain('We cannot host: full refund 960,00 €');
    expect(dialog).toContain('Goodwill or special case: you choose the refund');
  });

  it('puts the focus on keeping the booking, not on cancelling', async () => {
    renderDialog();
    await loaded();

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep the booking' }));
  });

  it('keeps the confirm button off until a real note is written, and then states the exact refund', async () => {
    renderDialog();
    await loaded();
    expect(confirmButton().hasAttribute('disabled')).toBe(true);

    fireEvent.change(screen.getByLabelText(/^Note/), { target: { value: 'Guest rang on the 3rd' } });

    expect(confirmButton().hasAttribute('disabled')).toBe(false);
    expect(plain(confirmButton().textContent)).toBe('Cancel and refund 720,00 €');
  });

  it('says the note is kept on the record with the staff member\'s name', async () => {
    renderDialog();
    await loaded();

    expect(screen.getByText(/Kept on the record with your name/)).toBeTruthy();
  });

  it('shows a full refund when the property cannot host', async () => {
    renderDialog();
    await loaded();

    await userEvent.click(screen.getByLabelText(/We cannot host/));
    fireEvent.change(screen.getByLabelText(/^Note/), { target: { value: 'Pipe burst' } });

    expect(plain(confirmButton().textContent)).toBe('Cancel and refund 960,00 €');
  });

  it('asks for a goodwill amount, bounded by what was paid, with a clear message', async () => {
    renderDialog();
    await loaded();
    await userEvent.click(screen.getByLabelText(/Goodwill or special case/));
    fireEvent.change(screen.getByLabelText(/^Note/), { target: { value: 'Apology' } });
    expect(confirmButton().hasAttribute('disabled')).toBe(true);

    fireEvent.change(screen.getByLabelText(/^Refund amount/), { target: { value: '1000' } });
    expect(plain(screen.getByRole('dialog').textContent)).toContain('cannot refund more');
    expect(confirmButton().hasAttribute('disabled')).toBe(true);

    fireEvent.change(screen.getByLabelText(/^Refund amount/), { target: { value: '0' } });
    expect(confirmButton().hasAttribute('disabled')).toBe(false);
    expect(confirmButton().textContent).toBe('Cancel with no refund');
  });

  it('cancels with the chosen reason and hands the updated booking back', async () => {
    api.cancelStaffReservation.mockResolvedValue(RESULT);
    const { onCancelled } = renderDialog();
    await loaded();
    fireEvent.change(screen.getByLabelText(/^Note/), { target: { value: 'Guest rang on the 3rd' } });

    await userEvent.click(confirmButton());

    await waitFor(() => expect(onCancelled).toHaveBeenCalledWith(RESULT));
    expect(api.cancelStaffReservation).toHaveBeenCalledWith('r1', { reason: 'guest_request', refundCents: null, note: 'Guest rang on the 3rd' });
  });

  it('keeps the form and shows the API message inline when cancelling fails', async () => {
    api.cancelStaffReservation.mockRejectedValue(new ApiRequestError('This booking is already cancelled.', 409));
    const { onCancelled } = renderDialog();
    await loaded();
    fireEvent.change(screen.getByLabelText(/^Note/), { target: { value: 'Guest rang' } });

    await userEvent.click(confirmButton());

    expect(await screen.findByText('This booking is already cancelled.')).toBeTruthy();
    expect((screen.getByLabelText(/^Note/) as HTMLTextAreaElement).value).toBe('Guest rang');
    expect(onCancelled).not.toHaveBeenCalled();
  });

  it('explains why instead of offering to cancel when the API says it cannot be cancelled', async () => {
    api.fetchStaffCancelPreview.mockResolvedValue({ ...PREVIEW, canCancel: false, blockedReason: 'This booking is already cancelled.' });
    renderDialog();

    expect(await screen.findByText('This booking is already cancelled.')).toBeTruthy();
    expect(screen.queryByLabelText(/^Note/)).toBeNull();
    expect(confirmButton().hasAttribute('disabled')).toBe(true);
  });

  it('shows the error when the details cannot be loaded', async () => {
    api.fetchStaffCancelPreview.mockRejectedValue(new ApiRequestError('Booking not found', 404));
    renderDialog();

    expect(await screen.findByText('Booking not found')).toBeTruthy();
  });

  it('says plainly when the booking has no refund ladder', async () => {
    api.fetchStaffCancelPreview.mockResolvedValue({ ...PREVIEW, policyRefund: null });
    renderDialog();
    await loaded();

    expect(screen.getByText(/has no refund ladder, so no refund/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/^Note/), { target: { value: 'Guest rang' } });
    expect(confirmButton().textContent).toBe('Cancel with no refund');
  });

  it('closes without cancelling when the booking is kept', async () => {
    const { onClose, onCancelled } = renderDialog();
    await loaded();

    await userEvent.click(screen.getByRole('button', { name: 'Keep the booking' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onCancelled).not.toHaveBeenCalled();
  });
});

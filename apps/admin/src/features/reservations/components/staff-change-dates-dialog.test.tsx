// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/reservations/components/staff-change-dates-dialog.test.tsx
 * @feature reservations
 */

import type { RebookQuote, StaffChangeDatesRequest, StaffChangeQuoteRequest, StaffChangeResult } from '@resort-booking/shared-types';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/shared/services/api-client';
import { rebookQuote, staffReservation } from '@/test/fixtures';
import { StaffChangeDatesDialog } from './staff-change-dates-dialog';

const api = vi.hoisted(() => ({
  quoteStaffChangeDates: vi.fn<(id: string, body: StaffChangeQuoteRequest) => Promise<RebookQuote>>(),
  changeStaffReservationDates: vi.fn<(id: string, body: StaffChangeDatesRequest) => Promise<StaffChangeResult>>(),
}));

vi.mock('../services/staff-reservations-api', () => api);

const STAY = { id: 'r1', reference: 'BK-ABC1234567', checkIn: '2027-07-10', checkOut: '2027-07-12' };
const RESULT: StaffChangeResult = { reservation: staffReservation({ id: 'r2', reference: 'BK-NEW0000000' }), refund: null };

const plain = (text: string | null | undefined): string => (text ?? '').replace(/\s/g, ' ');

function renderDialog(canManageRefunds = true, lockedReason: string | null = null): { onClose: () => void; onChanged: (result: StaffChangeResult) => void } {
  const handlers = { onClose: vi.fn<() => void>(), onChanged: vi.fn<(result: StaffChangeResult) => void>() };
  render(<StaffChangeDatesDialog open stay={STAY} canManageRefunds={canManageRefunds} lockedReason={lockedReason} {...handlers} />);
  return handlers;
}

async function seeThePrice(quote: RebookQuote = rebookQuote()): Promise<void> {
  api.quoteStaffChangeDates.mockResolvedValue(quote);
  fireEvent.change(screen.getByLabelText(/^New check-in/), { target: { value: '2027-07-20' } });
  await userEvent.click(screen.getByRole('button', { name: 'See price' }));
  await screen.findByLabelText('Price of the new dates');
}

function confirmButton(): HTMLElement {
  return screen.getByRole('button', { name: /^Change dates|Changing…/ });
}

describe('StaffChangeDatesDialog', () => {
  beforeEach(() => {
    api.quoteStaffChangeDates.mockReset();
    api.changeStaffReservationDates.mockReset();
  });

  afterEach(cleanup);

  it('hides the fee waiver and the outside-payment confirmation from someone without refund access', async () => {
    renderDialog(false);
    expect(screen.queryByLabelText('Waive the change fee')).toBeNull();
    await seeThePrice(rebookQuote({ payCents: 5000, available: true }));

    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByText(/An admin or someone with refund access has to confirm that the guest paid it/)).toBeTruthy();
  });

  it('shows the same-day message and disables both buttons when the booking is locked for an employee', () => {
    renderDialog(false, 'Check-in is today (or has passed). An admin has to cancel or change this booking.');

    expect(screen.getByText('Check-in is today (or has passed). An admin has to cancel or change this booking.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'See price' }) as HTMLButtonElement).disabled).toBe(true);
    expect((confirmButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows an admin the fee waiver', () => {
    renderDialog(true);

    expect(screen.getByLabelText('Waive the change fee')).toBeTruthy();
  });

  it('says it works even when guests cannot change their own dates, and that the booking is replaced', () => {
    renderDialog();

    const text = plain(screen.getByRole('dialog').textContent);
    expect(text).toContain('even when guests cannot change their own dates');
    expect(text).toContain('replaced by a new booking with a new reference');
  });

  it('starts on the current dates and will not price a change that is no change', () => {
    renderDialog();

    expect((screen.getByLabelText(/^Nights/) as HTMLInputElement).value).toBe('2');
    expect(screen.getByText('New check-out: 2027-07-12')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'See price' }).hasAttribute('disabled')).toBe(true);
  });

  it('allows typing a date in the past: admin pickers never block history', () => {
    renderDialog();

    fireEvent.change(screen.getByLabelText(/^New check-in/), { target: { value: '2019-01-01' } });

    expect((screen.getByLabelText(/^New check-in/) as HTMLInputElement).value).toBe('2019-01-01');
    expect(screen.getByRole('button', { name: 'See price' }).hasAttribute('disabled')).toBe(false);
  });

  it('shows the exact price difference after "See price", with the outside-payment tick when the guest owes money', async () => {
    renderDialog();

    await seeThePrice();

    expect(plain(screen.getByLabelText('Price of the new dates').textContent)).toContain('The guest owes 308,00 € more');
    expect(plain(screen.getByLabelText(/has paid the difference of/).closest('label')?.textContent)).toContain('308,00 €');
  });

  it('keeps the confirm button off until the outside payment is ticked and a note is written', async () => {
    renderDialog();
    await seeThePrice();
    expect(confirmButton().hasAttribute('disabled')).toBe(true);

    fireEvent.change(screen.getByLabelText(/^Note/), { target: { value: 'Paid cash at the desk' } });
    expect(confirmButton().hasAttribute('disabled')).toBe(true);

    await userEvent.click(screen.getByLabelText(/has paid the difference of/));
    expect(confirmButton().hasAttribute('disabled')).toBe(false);
    expect(plain(confirmButton().textContent)).toBe('Change dates (guest paid 308,00 €)');
  });

  it('does not ask for an outside payment when the guest gets money back, and says so on the button', async () => {
    renderDialog();
    await seeThePrice(rebookQuote({ newTotalCents: 80000, payCents: 0, refundCents: 12000, balanceCents: -12000 }));

    expect(screen.queryByLabelText(/has paid the difference of/)).toBeNull();
    fireEvent.change(screen.getByLabelText(/^Note/), { target: { value: 'Guest asked to shorten' } });

    expect(plain(confirmButton().textContent)).toBe('Change dates and refund 120,00 €');
    expect(confirmButton().hasAttribute('disabled')).toBe(false);
  });

  it('sends the waive-fee choice with the price request', async () => {
    renderDialog();
    fireEvent.change(screen.getByLabelText(/^New check-in/), { target: { value: '2027-07-20' } });
    await userEvent.click(screen.getByLabelText('Waive the change fee'));
    api.quoteStaffChangeDates.mockResolvedValue(rebookQuote({ feeCents: 0 }));

    await userEvent.click(screen.getByRole('button', { name: 'See price' }));

    await waitFor(() => expect(api.quoteStaffChangeDates).toHaveBeenCalledWith('r1', expect.objectContaining({ waiveFee: true })));
  });

  it('does not offer to confirm dates that are not available, and shows why', async () => {
    renderDialog();

    await seeThePrice(rebookQuote({ available: false, problem: 'Those dates are not available for this stay.' }));

    expect(screen.getByText('Those dates are not available for this stay.')).toBeTruthy();
    expect(screen.queryByLabelText(/^Note/)).toBeNull();
    expect(confirmButton().hasAttribute('disabled')).toBe(true);
  });

  it('changes the dates and hands over the NEW booking', async () => {
    api.changeStaffReservationDates.mockResolvedValue(RESULT);
    const { onChanged } = renderDialog();
    await seeThePrice();
    fireEvent.change(screen.getByLabelText(/^Note/), { target: { value: 'Paid cash at the desk' } });
    await userEvent.click(screen.getByLabelText(/has paid the difference of/));

    await userEvent.click(confirmButton());

    await waitFor(() => expect(onChanged).toHaveBeenCalledWith(RESULT));
    expect(api.changeStaffReservationDates).toHaveBeenCalledWith('r1', expect.objectContaining({ note: 'Paid cash at the desk', balanceSettledOutside: true }));
  });

  it('keeps the form and shows the API message when the change is refused', async () => {
    api.changeStaffReservationDates.mockRejectedValue(new ApiRequestError('Those dates are not available for this stay.', 409));
    const { onChanged } = renderDialog();
    await seeThePrice();
    fireEvent.change(screen.getByLabelText(/^Note/), { target: { value: 'Paid cash at the desk' } });
    await userEvent.click(screen.getByLabelText(/has paid the difference of/));

    await userEvent.click(confirmButton());

    expect(await screen.findAllByText('Those dates are not available for this stay.')).not.toHaveLength(0);
    expect((screen.getByLabelText(/^Note/) as HTMLTextAreaElement).value).toBe('Paid cash at the desk');
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('puts the focus on keeping the current dates, and closes without changing anything', async () => {
    const { onClose, onChanged } = renderDialog();

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Keep the current dates' }));
    await userEvent.click(screen.getByRole('button', { name: 'Keep the current dates' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onChanged).not.toHaveBeenCalled();
  });
});

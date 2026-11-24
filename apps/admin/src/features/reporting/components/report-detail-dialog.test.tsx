// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/reporting/components/report-detail-dialog.test.tsx
 * @feature reporting
 */

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { staffReservation } from '@/test/fixtures';
import { ReportDetailDialog } from './report-detail-dialog';

describe('ReportDetailDialog', () => {
  afterEach(cleanup);

  it('renders nothing while there is no detail', () => {
    render(<ReportDetailDialog detail={null} onClose={vi.fn()} />);

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('lists the bookings with plain status and payment words', () => {
    render(
      <ReportDetailDialog
        detail={{ title: '10 Jul 2027', caption: 'Bookings with a night on these dates.', stays: [staffReservation(), staffReservation({ id: 'r2', bookerName: 'Grace', paymentMethod: 'bank_transfer', status: 'cancelled' })] }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('dialog', { name: /10 Jul 2027/ })).toBeTruthy();
    expect(screen.getByText('Confirmed')).toBeTruthy();
    expect(screen.getByText('Cancelled')).toBeTruthy();
    expect(screen.getByText('Bank transfer')).toBeTruthy();
    expect(screen.getByText('Card / wallets')).toBeTruthy();
  });

  it('explains an empty list and closes', () => {
    const onClose = vi.fn();
    render(<ReportDetailDialog detail={{ title: 'Nobody', caption: 'x', stays: [] }} onClose={onClose} />);

    expect(screen.getByText('No bookings here. Try a longer period.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

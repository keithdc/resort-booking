// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/reporting/components/bookings-compact.test.tsx
 * @feature reporting
 * Phone layout: the bookings list is cards, each with an Open button.
 */

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { staffReport } from '@/test/fixtures';
import { BookingsTab } from './bookings-tab';

vi.mock('@/shared/hooks/use-compact-layout', () => ({ useCompactLayout: (): boolean => true, usePhoneLayout: (): boolean => true }));
vi.mock('@/features/reservations/components/stay-detail-dialog', () => ({
  StayDetailDialog: ({ stay }: { stay: { bookerName: string } | null }): React.JSX.Element | null =>
    stay === null ? null : <div role="dialog" aria-label="Booking detail">{stay.bookerName}</div>,
}));

describe('BookingsTab on a phone', () => {
  afterEach(cleanup);

  it('lists bookings as cards and opens one', () => {
    const report = staffReport();
    render(<BookingsTab report={report} status={null} onStatusChange={vi.fn()} onChanged={vi.fn()} />);

    expect(screen.queryByRole('table')).toBeNull();
    const cards = within(screen.getByRole('list', { name: 'Bookings in this period' })).getAllByRole('listitem');
    expect(cards).toHaveLength(report.pipeline.length);
    fireEvent.click(within(cards[0] as HTMLElement).getByRole('button', { name: /^Open booking/ }));
    expect(screen.getByRole('dialog', { name: 'Booking detail' })).toBeTruthy();
  });
});

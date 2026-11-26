// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/reporting/components/reports-page.test.tsx
 * @feature reporting
 */

import type { PropertySummary, StaffReport } from '@resort-booking/shared-types';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '@/shared/services/api-client';
import { staffReport } from '@/test/fixtures';
import { ReportsPage } from './reports-page';

const mocks = vi.hoisted(() => ({
  fetchStaffProperties: vi.fn<() => Promise<PropertySummary[]>>(),
  fetchStaffReport: vi.fn<(from: string, to: string, propertyId: string) => Promise<StaffReport>>(),
  downloadTextFile: vi.fn<(name: string, content: string) => void>(),
  navigation: { query: '', replace: vi.fn<(url: string, options: { scroll: boolean }) => void>() },
}));

vi.mock('@/features/property/services/staff-property-api', () => ({ fetchStaffProperties: mocks.fetchStaffProperties }));
vi.mock('@/features/reservations/services/staff-reservations-api', () => ({ fetchStaffReport: mocks.fetchStaffReport }));
vi.mock('@/shared/utils/download-text-file', () => ({ downloadTextFile: mocks.downloadTextFile }));
vi.mock('@/features/reservations/components/stay-detail-dialog', () => ({ StayDetailDialog: (): null => null }));
vi.mock('next/navigation', () => ({
  useRouter: (): { replace: typeof mocks.navigation.replace } => ({ replace: mocks.navigation.replace }),
  usePathname: (): string => '/reports',
  useSearchParams: (): URLSearchParams => new URLSearchParams(mocks.navigation.query),
}));

describe('ReportsPage', () => {
  beforeEach(() => {
    mocks.navigation.query = '';
    mocks.navigation.replace.mockReset();
    mocks.downloadTextFile.mockReset();
    mocks.fetchStaffProperties.mockReset().mockResolvedValue([]);
    mocks.fetchStaffReport.mockReset().mockResolvedValue(staffReport());
  });

  afterEach(cleanup);

  it('shows the loading state, then the headline cards, the attention strip and the overview', async () => {
    render(<ReportsPage />);

    expect(screen.getByLabelText('Loading the report')).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'At a glance' })).toBeTruthy();

    expect(screen.getByRole('heading', { name: 'Needs your attention' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Revenue and occupancy' })).toBeTruthy();
    expect(screen.getByText(/Showing All properties for/)).toBeTruthy(); // announced to screen readers only
  });

  it('asks for this month for all properties to start with', async () => {
    render(<ReportsPage />);
    await screen.findByRole('heading', { name: 'At a glance' });

    const [from, to, propertyId] = mocks.fetchStaffReport.mock.calls[0] ?? [];
    expect(from).toMatch(/^\d{4}-\d{2}-01$/);
    expect(to).toMatch(/^\d{4}-\d{2}-01$/);
    expect(propertyId).toBe('');
  });

  it('loads again for another period', async () => {
    render(<ReportsPage />);
    await screen.findByRole('heading', { name: 'At a glance' });

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Period' }));
    fireEvent.click(screen.getByRole('option', { name: /^Last month/ }));

    await waitFor(() => expect(mocks.fetchStaffReport).toHaveBeenCalledTimes(2));
  });

  it('opens the tab named in the address', async () => {
    mocks.navigation.query = 'tab=cancellations';
    render(<ReportsPage />);

    expect(await screen.findByRole('tabpanel', { name: 'Cancellations & refunds' })).toBeTruthy();
  });

  it('writes the tab into the address when one is chosen', async () => {
    render(<ReportsPage />);
    await screen.findByRole('heading', { name: 'At a glance' });

    fireEvent.click(screen.getByRole('tab', { name: 'Bookings' }));

    expect(mocks.navigation.replace).toHaveBeenCalledWith('/reports?tab=bookings', { scroll: false });
  });

  it('takes you to the bookings tab filtered to unpaid holds from the attention strip', async () => {
    mocks.navigation.query = 'tab=bookings';
    render(<ReportsPage />);
    await screen.findByRole('heading', { name: 'At a glance' });

    fireEvent.click(screen.getByRole('button', { name: '1 unpaid hold' }));

    expect(mocks.navigation.replace).toHaveBeenCalledWith('/reports?tab=bookings', { scroll: false });
    expect(screen.getByText('1 booking')).toBeTruthy();
  });

  it('takes you to the bookings tab filtered to what is unpaid at the hotel, soonest check-in first', async () => {
    const base = staffReport();
    const unpaid = (id: string, reference: string, checkIn: string, checkOut: string): StaffReport['pipeline'][number] => ({
      ...(base.pipeline[1] ?? base.stays[0]!),
      id, reference, paymentMethod: 'pay_at_hotel', paymentStatus: 'pending', paidCents: 0, checkIn, checkOut, bookerName: `Guest ${reference}`,
    });
    mocks.fetchStaffReport.mockResolvedValue({
      ...base,
      pipeline: [...base.pipeline, unpaid('u2', 'BK-LATE00000', '2027-07-29', '2027-07-30'), unpaid('u1', 'BK-SOON00000', '2027-07-16', '2027-07-17')],
      unpaidAtHotelCount: 2,
      unpaidAtHotelCents: 20000,
      attention: { ...base.attention, unpaidAtHotelCount: 2, unpaidAtHotelCents: 20000, unpaidAtHotelArrivalsNext7DaysCount: 1 },
    });
    mocks.navigation.query = 'tab=bookings';
    render(<ReportsPage />);
    await screen.findByRole('heading', { name: 'At a glance' });

    fireEvent.click(screen.getByRole('button', { name: '2 unpaid at hotel' }));

    expect(screen.getByText('2 bookings')).toBeTruthy();
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((row) => row.textContent)).toEqual([expect.stringContaining('BK-SOON00000'), expect.stringContaining('BK-LATE00000')]);
  });

  it('downloads the CSV with a file named after the period', async () => {
    render(<ReportsPage />);
    await screen.findByRole('heading', { name: 'At a glance' });

    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));

    expect(mocks.downloadTextFile).toHaveBeenCalledTimes(1);
    const [name, content] = mocks.downloadTextFile.mock.calls[0] ?? [];
    expect(name).toBe('humphreys-report-2027-07-01-to-2027-07-31.csv');
    expect(content).toContain('Humphreys report');
    expect(content).toContain('BK-AAAA000001');
  });

  it('prints through the browser', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    render(<ReportsPage />);
    await screen.findByRole('heading', { name: 'At a glance' });

    fireEvent.click(screen.getByRole('button', { name: 'Print / Save as PDF' }));

    expect(print).toHaveBeenCalledTimes(1);
    print.mockRestore();
  });

  it('includes a title block, and the definitions, for the printed report', async () => {
    render(<ReportsPage />);
    await screen.findByRole('heading', { name: 'At a glance' });

    expect(screen.getByText('Humphreys — Report')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'What the numbers mean', hidden: true })).toBeTruthy();
  });

  it('shows the API error with a way to try again', async () => {
    mocks.fetchStaffReport.mockRejectedValueOnce(new ApiRequestError('Something broke', 500));
    render(<ReportsPage />);

    expect(await screen.findByText('Something broke')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'At a glance' })).toBeNull();
    expect((screen.getByRole('button', { name: 'Download CSV' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { name: 'At a glance' })).toBeTruthy();
  });

  it('asks for both days while a custom period is empty and does not load', async () => {
    render(<ReportsPage />);
    await screen.findByRole('heading', { name: 'At a glance' });
    mocks.fetchStaffReport.mockClear();

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Period' }));
    fireEvent.click(screen.getByRole('option', { name: /^Custom dates/ }));

    expect(await screen.findByText('Pick a first and a last day to see the report.')).toBeTruthy();
    expect(mocks.fetchStaffReport).not.toHaveBeenCalled();
  });
});

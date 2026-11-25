// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/reporting/components/report-header.test.tsx
 * @feature reporting
 */

import type { PropertySummary } from '@resort-booking/shared-types';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReportPeriod } from '../hooks/use-report-period';
import { ReportHeader } from './report-header';

function period(overrides: Partial<ReportPeriod> = {}): ReportPeriod {
  return {
    preset: 'this_month',
    setPreset: vi.fn(),
    firstDay: '',
    lastDay: '',
    setFirstDay: vi.fn(),
    setLastDay: vi.fn(),
    range: { from: '2027-07-01', to: '2027-08-01' },
    problem: null,
    ...overrides,
  };
}

const PROPERTIES = [{ id: 'p1', name: 'Alpine Lake' }, { id: 'p2', name: 'Atlantic Dune' }] as PropertySummary[];

function renderHeader(overrides: Partial<Parameters<typeof ReportHeader>[0]> = {}): Record<'onPropertyChange' | 'onDownload' | 'onPrint' | 'onRefresh', ReturnType<typeof vi.fn>> {
  const handlers = { onPropertyChange: vi.fn(), onDownload: vi.fn(), onPrint: vi.fn(), onRefresh: vi.fn() };
  render(<ReportHeader period={period()} properties={PROPERTIES} propertyId="" loading={false} canExport {...handlers} {...overrides} />);
  return handlers;
}

describe('ReportHeader', () => {
  afterEach(cleanup);

  it('shows the title, a plain intro, the chosen period and the dates it covers', () => {
    renderHeader();

    expect(screen.getByRole('heading', { level: 1, name: 'Reports' })).toBeTruthy();
    expect(screen.getByText(/How your properties are doing/)).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'Period' }).textContent).toBe('This month');
    expect(screen.getByLabelText('Dates covered: 1 Jul – 31 Jul 2027')).toBeTruthy();
  });

  it('lists every preset under a heading, each with the dates it covers today', () => {
    renderHeader();

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Period' }));
    const listbox = screen.getByRole('listbox');

    const headings = ['Days and weeks', 'Months', 'Quarters and years', 'Your own dates'];
    const labels = within(listbox)
      .getAllByRole('option')
      .map((option) => option.textContent ?? '')
      .filter((text) => !headings.includes(text));
    const expected = [
      'Today', 'This week', 'Last week', 'Last 30 days', 'Next 30 days', 'This month', 'Last month',
      'This quarter', 'Last quarter', 'This year', 'Last year', 'Custom dates',
    ];
    expect(labels).toHaveLength(expected.length);
    expected.forEach((label, index) => expect(labels[index].startsWith(label)).toBe(true));
    for (const heading of headings) {
      expect(within(listbox).getByText(heading)).toBeTruthy();
    }
    expect(within(listbox).getByRole('option', { name: /^This year/ }).textContent).toMatch(/\d{4}/);
  });

  it('keeps the long period list short enough to scroll', () => {
    renderHeader();

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Period' }));

    const paper = screen.getByRole('listbox').closest('.MuiPaper-root');
    expect(paper).not.toBeNull();
    expect(getComputedStyle(paper as Element).maxHeight).toBe('360px');
  });

  it('changes the period', () => {
    const chosen = period();
    renderHeader({ period: chosen });

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Period' }));
    fireEvent.click(screen.getByRole('option', { name: /^Last quarter/ }));

    expect(chosen.setPreset).toHaveBeenCalledWith('last_quarter');
  });

  it('asks for the two days instead of showing dates while a custom period is incomplete', () => {
    renderHeader({ period: period({ preset: 'custom', range: null }) });

    expect(screen.getByLabelText('Dates covered: not chosen yet')).toBeTruthy();
  });

  it('shows the custom days only for Custom, with the problem next to the last day', () => {
    renderHeader({ period: period({ preset: 'custom', problem: 'The last day cannot be before the first day.' }) });

    expect(screen.getByLabelText('First day')).toBeTruthy();
    expect(screen.getByText('The last day cannot be before the first day.')).toBeTruthy();
  });

  it('hides the custom days for the other periods', () => {
    renderHeader();

    expect(screen.queryByLabelText('First day')).toBeNull();
  });

  it('filters by property, with All properties as the start', () => {
    const { onPropertyChange } = renderHeader();

    fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Property' }));
    fireEvent.click(screen.getByRole('option', { name: 'Atlantic Dune' }));

    expect(onPropertyChange).toHaveBeenCalledWith('p2');
  });

  it('downloads, prints and refreshes', () => {
    const { onDownload, onPrint, onRefresh } = renderHeader();

    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }));
    fireEvent.click(screen.getByRole('button', { name: 'Print / Save as PDF' }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(onPrint).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('disables download and print without a report, and refresh while loading', () => {
    renderHeader({ canExport: false, loading: true });

    expect((screen.getByRole('button', { name: 'Download CSV' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Print / Save as PDF' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Refresh' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

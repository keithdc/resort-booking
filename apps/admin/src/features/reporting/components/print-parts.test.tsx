// @vitest-environment jsdom
/**
 * @file apps/admin/src/features/reporting/components/print-parts.test.tsx
 * @feature reporting
 */

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { METRIC_DEFINITIONS } from '../utils/metric-definitions';
import { MetricInfo } from './metric-info';
import { PrintStyles } from './print-styles';
import { PrintTitleBlock } from './print-title-block';
import { ReportGlossary } from './report-glossary';

describe('print parts', () => {
  afterEach(cleanup);

  it('title block names the property, the period and the date', () => {
    render(<PrintTitleBlock propertyName="Alpine Lake" periodLabel="1 Jul – 31 Jul 2027" generatedOn="15 Jul 2027" />);

    expect(screen.getByText('Humphreys — Report').closest('[data-print="only"]')).toBeTruthy();
    expect(screen.getByText('Alpine Lake')).toBeTruthy();
    expect(screen.getByText('1 Jul – 31 Jul 2027')).toBeTruthy();
    expect(screen.getByText('Generated 15 Jul 2027')).toBeTruthy();
  });

  it('glossary lists every definition and is print-only', () => {
    render(<ReportGlossary />);

    const section = screen.getByLabelText('What the numbers mean');
    expect(section.getAttribute('data-print')).toBe('only');
    expect(section.querySelectorAll('dt')).toHaveLength(Object.keys(METRIC_DEFINITIONS).length);
    expect(section.textContent).toContain(METRIC_DEFINITIONS.revenue.definition);
  });

  it('metric info is a keyboard-reachable button named after the metric and hidden when printing', () => {
    render(<MetricInfo metric="occupancy" />);

    const button = screen.getByRole('button', { name: 'What does Occupancy mean?' });
    expect(button.getAttribute('data-print')).toBe('hide');
  });

  it('print styles render without output of their own', () => {
    const { container } = render(<PrintStyles />);

    expect(container.textContent).toBe('');
  });
});

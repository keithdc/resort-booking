/**
 * @file apps/admin/src/features/reporting/components/print-styles.tsx
 * @feature reporting
 * @dependencies @mui/material
 */

'use client';

import { GlobalStyles } from '@mui/material';

/**
 * What changes when the report is printed or saved as PDF: controls (marked data-print="hide") and the
 * app's navigation disappear, every tab's content is shown in order, and page breaks stay tidy.
 */
export function PrintStyles(): React.JSX.Element {
  return (
    <GlobalStyles
      styles={{
        '@media print': {
          '[data-print="hide"]': { display: 'none !important' },
          '[data-print="only"]': { display: 'block !important' },
          '[role="tabpanel"][hidden]': { display: 'block !important' },
          'nav, header, aside': { display: 'none !important' },
          body: { background: 'transparent !important' },
          '@page': { margin: '14mm' },
          h2: { breakAfter: 'avoid' },
          h3: { breakAfter: 'avoid' },
          table: { breakInside: 'auto' },
          tr: { breakInside: 'avoid' },
        },
      }}
    />
  );
}

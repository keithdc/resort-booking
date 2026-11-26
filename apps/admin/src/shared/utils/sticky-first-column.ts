/**
 * @file apps/admin/src/shared/utils/sticky-first-column.ts
 * @shared sx for a wide table inside a scrolling TableContainer: the first column stays put while the rest scrolls
 * @dependencies @mui/material
 */

import { alpha, type Theme } from '@mui/material/styles';

/**
 * Pass as the `sx` of a TableContainer. Below `md` the first cell of every row is pinned to the left with an
 * opaque background (so scrolled text does not show through) and a soft edge; from `md` up nothing changes.
 * The head cell keeps its tint by painting it on top of the paper colour.
 */
export function stickyFirstColumn(theme: Theme): Record<string, unknown> {
  const head = alpha(theme.palette.primary.main, 0.08);
  return {
    [theme.breakpoints.down('md')]: {
      '& th:first-of-type, & td:first-of-type': {
        position: 'sticky',
        left: 0,
        minWidth: 140,
        maxWidth: '52vw',
        zIndex: 1,
        backgroundColor: theme.palette.background.paper,
        boxShadow: `1px 0 0 ${theme.palette.divider}`,
      },
      '& thead th:first-of-type': {
        backgroundImage: `linear-gradient(${head}, ${head})`,
        zIndex: 2,
      },
    },
  };
}

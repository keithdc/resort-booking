/**
 * @file apps/web/src/features/houses/components/search-edit-sheet.tsx
 * @feature houses
 * @dependencies @mui/material, next/navigation
 */

'use client';

import TuneIcon from '@mui/icons-material/Tune';
import { Box, Button, Drawer, IconButton, Typography } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

interface SearchEditSheetProps {
  /** One line describing the current search ("10 Dec – 12 Dec · 2 guests"), worded by the server. */
  summary: string;
  /** The search form. Shown inline from the `md` breakpoint, inside a bottom sheet below it. */
  children: ReactNode;
}

/**
 * Keeps the results above the fold on a phone: the search form collapses to a one-line summary
 * and opens as a bottom sheet to change dates or guests. The sheet closes itself when the new search
 * arrives (the address changes). Desktop shows the form inline, as before.
 */
export function SearchEditSheet({ summary, children }: SearchEditSheetProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const searchKey = useSearchParams().toString();

  // A new search changes the address; the sheet has done its job.
  useEffect((): void => {
    setOpen(false);
  }, [searchKey]);

  return (
    <>
      <Box sx={{ display: { xs: 'none', md: 'block' } }}>{children}</Box>
      <Box sx={{ display: { xs: 'block', md: 'none' } }}>
        <Button
          variant="outlined"
          fullWidth
          onClick={(): void => setOpen(true)}
          aria-haspopup="dialog"
          startIcon={<TuneIcon />}
          sx={{ justifyContent: 'flex-start', minHeight: 52, textAlign: 'left', color: 'text.primary', borderColor: 'divider' }}
        >
          <Box component="span" sx={{ flexGrow: 1 }}>
            {summary}
          </Box>
          <Box component="span" sx={{ color: 'primary.main', fontWeight: 600, ml: 1 }}>
            Edit
          </Box>
        </Button>
        <Drawer
          anchor="bottom"
          open={open}
          onClose={(): void => setOpen(false)}
          slotProps={{
            paper: {
              'aria-label': 'Change your search',
              sx: {
                maxHeight: '92dvh',
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                pb: 'env(safe-area-inset-bottom)',
              },
            },
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pl: 2, pr: 1, pt: 1 }}>
            <Typography variant="h6" component="h2">
              Change your search
            </Typography>
            <IconButton aria-label="Close search" onClick={(): void => setOpen(false)}>
              <CloseIcon />
            </IconButton>
          </Box>
          <Box sx={{ p: 2, pt: 1, overflowY: 'auto' }}>{open ? children : null}</Box>
        </Drawer>
      </Box>
    </>
  );
}
